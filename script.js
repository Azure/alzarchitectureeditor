document.addEventListener('DOMContentLoaded', function () {
  // Global variables
  let currentData = null;
  let selectedMgId = null;
  let draggedMgId = null;
  let dropSuccessful = false; // Add flag to track successful drops
  let isUpdating = false; // Flag to prevent recursive updates

  // DOM Elements - add new elements for archetypes
  const mgTreeView = document.getElementById('management-groups-tree');
  const editForm = document.getElementById('edit-form');
  const noSelection = document.getElementById('no-selection');
  const mgIdInput = document.getElementById('mg-id');
  const mgDisplayNameInput = document.getElementById('mg-display-name');
  const mgParentIdSelect = document.getElementById('mg-parent-id');
  const mgArchetypesInput = document.getElementById('mg-archetypes-input');
  const mgArchetypesTags = document.getElementById('archetypes-tags');
  const mgExistsCheckbox = document.getElementById('mg-exists');
  const architectureNameInput = document.getElementById('architecture-name');
  const jsonPreview = document.getElementById('json-content');
  const addArchetypeBtn = document.getElementById('add-archetype-btn');

  // Add event listeners for architecture name
  architectureNameInput.addEventListener('change', updateArchitectureName);
  architectureNameInput.addEventListener('input', handleArchitectureNameInput);

  // Add event listeners for real-time management group updates
  mgIdInput.addEventListener('input', handleIdUpdate); // Change this line
  mgIdInput.addEventListener('blur', validateIdOnBlur); // Rename this function
  mgDisplayNameInput.addEventListener('input', handleFieldUpdate);
  mgParentIdSelect.addEventListener('change', handleFieldUpdate);
  // Replace archetype input listener with new ones
  mgArchetypesInput.addEventListener('keydown', handleArchetypeKeydown);
  addArchetypeBtn.addEventListener('click', addArchetype);
  mgExistsCheckbox.addEventListener('change', handleFieldUpdate);

  // Buttons
  document.getElementById('new-architecture').addEventListener('click', createNewArchitecture);
  document.getElementById('load-alz').addEventListener('click', loadDefaultAlz);
  document.getElementById('upload-file').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', handleFileUpload);
  document.getElementById('download-file').addEventListener('click', downloadJson);
  document.getElementById('add-mg-btn').addEventListener('click', addNewManagementGroup);
  document.getElementById('delete-mg-btn').addEventListener('click', deleteManagementGroup);
  // Remove save button event listener

  // Handle archetype input keydown (to catch Enter key)
  function handleArchetypeKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent form submission
      addArchetype();
    }
  }

  // Add an archetype tag
  function addArchetype() {
    if (!selectedMgId || !currentData) return;

    const value = mgArchetypesInput.value.trim();
    if (!value) return;

    const index = currentData.management_groups.findIndex(mg => mg.id === selectedMgId);
    if (index === -1) return;

    // Add the archetype if it doesn't already exist
    if (!currentData.management_groups[index].archetypes.includes(value)) {
      currentData.management_groups[index].archetypes.push(value);

      // Update the UI
      renderArchetypeTags(currentData.management_groups[index].archetypes);

      // Clear the input
      mgArchetypesInput.value = '';

      // Only update the JSON preview, no need to re-render the entire tree
      // which causes the parent dropdown to reset
      updateJsonPreview();
    }

    // Focus back on the input for rapid addition
    mgArchetypesInput.focus();
  }

  // Remove an archetype tag
  function removeArchetype(archetype) {
    if (!selectedMgId || !currentData) return;

    const index = currentData.management_groups.findIndex(mg => mg.id === selectedMgId);
    if (index === -1) return;

    // Remove the archetype
    currentData.management_groups[index].archetypes =
      currentData.management_groups[index].archetypes.filter(a => a !== archetype);

    // Update the UI
    renderArchetypeTags(currentData.management_groups[index].archetypes);

    // Only update the JSON preview, no need to re-render the entire tree
    updateJsonPreview();
  }

  // Render archetype tags from array
  function renderArchetypeTags(archetypes) {
    mgArchetypesTags.innerHTML = '';

    if (!archetypes || !archetypes.length) {
      return;
    }

    archetypes.forEach(archetype => {
      const tagElement = document.createElement('div');
      tagElement.className = 'archetype-tag';

      const textElement = document.createElement('span');
      textElement.className = 'archetype-tag-text';
      textElement.textContent = archetype;

      const removeElement = document.createElement('span');
      removeElement.className = 'remove-archetype';
      removeElement.innerHTML = '&times;';
      removeElement.title = 'Remove this archetype';
      removeElement.addEventListener('click', () => removeArchetype(archetype));

      tagElement.appendChild(textElement);
      tagElement.appendChild(removeElement);
      mgArchetypesTags.appendChild(tagElement);
    });
  }

  // Handle updates when any field changes
  function handleFieldUpdate(e) {
    if (!selectedMgId || !currentData || isUpdating) return;

    // Skip handling the ID field, it's handled in handleIdUpdate()
    if (e.target === mgIdInput) return;

    const index = currentData.management_groups.findIndex(mg => mg.id === selectedMgId);
    if (index === -1) return;

    // Get current management group
    const currentMg = currentData.management_groups[index];

    // Get updated values from form
    const newDisplayName = mgDisplayNameInput.value.trim();
    const newParentId = mgParentIdSelect.value === 'null' ? null : mgParentIdSelect.value;
    const newExists = mgExistsCheckbox.checked;

    // Handle validation for existence status
    if (e.target === mgExistsCheckbox && newExists) {
      // Check if parent exists
      if (newParentId !== null) {
        const parentMg = currentData.management_groups.find(mg => mg.id === newParentId);
        if (parentMg && !parentMg.exists) {
          alert('A management group cannot exist if its parent is planned. Please set the parent to "exists" first.');
          isUpdating = true;
          mgExistsCheckbox.checked = false;
          isUpdating = false;
          return;
        }
      }
    }

    if (e.target === mgExistsCheckbox && !newExists) {
      // Check if setting this MG to non-existent would conflict with existing children
      const hasExistingChildren = currentData.management_groups.some(
        mg => mg.parent_id === selectedMgId && mg.exists
      );

      if (hasExistingChildren) {
        alert('Cannot mark this management group as planned when it has existing children. Please update the children first.');
        isUpdating = true;
        mgExistsCheckbox.checked = true;
        isUpdating = false;
        return;
      }
    }

    if (e.target === mgParentIdSelect) {
      // Check for cycles when changing parent
      if (wouldCreateCycle(selectedMgId, newParentId)) {
        alert("Cannot move a management group to one of its descendants.");
        isUpdating = true;
        mgParentIdSelect.value = currentMg.parent_id === null ? 'null' : currentMg.parent_id;
        isUpdating = false;
        return;
      }

      // Check if new parent exists when this MG exists
      if (currentMg.exists && newParentId !== null) {
        const parentMg = currentData.management_groups.find(mg => mg.id === newParentId);
        if (parentMg && !parentMg.exists) {
          alert('A management group cannot exist if its parent is planned. Please set the parent to "exists" first.');
          isUpdating = true;
          mgParentIdSelect.value = currentMg.parent_id === null ? 'null' : currentMg.parent_id;
          isUpdating = false;
          return;
        }
      }
    }

    // Update values (removed archetypes as they're now handled separately)
    currentMg.display_name = newDisplayName;
    currentMg.parent_id = newParentId;
    currentMg.exists = newExists;

    // Update tree and JSON preview
    renderManagementGroups();
    updateJsonPreview();

    // Re-select the current management group
    selectManagementGroup(selectedMgId);
  }

  // Special handler for ID updates in real-time
  function handleIdUpdate(e) {
    if (!selectedMgId || !currentData || isUpdating) return;

    const newId = mgIdInput.value.trim();
    if (!newId) return; // Don't process empty IDs while typing

    // If ID hasn't changed, do nothing
    if (newId === selectedMgId) return;

    // Check if ID already exists
    if (currentData.management_groups.some(mg => mg.id === newId && mg.id !== selectedMgId)) {
      // Don't show alert while typing - we'll validate fully on blur
      return;
    }

    const index = currentData.management_groups.findIndex(mg => mg.id === selectedMgId);
    if (index === -1) return;

    // Store the original ID for reference updates
    const originalId = selectedMgId;

    // Update the management group ID in the data model
    currentData.management_groups[index].id = newId;

    // Update parent_id references
    currentData.management_groups.forEach(mg => {
      if (mg.parent_id === originalId) {
        mg.parent_id = newId;
      }
    });

    // Update selected ID reference
    selectedMgId = newId;

    // Update the tree view in real-time, just like for display name changes
    // Save cursor position
    const cursorPosition = mgIdInput.selectionStart;

    // Update the tree view
    renderManagementGroups();

    // Update JSON preview
    updateJsonPreview();

    // Select the updated node
    const updatedItem = document.querySelector(`.tree-item[data-id="${newId}"]`);
    if (updatedItem) {
      // Clear previous selection
      const prevSelected = document.querySelector('.tree-item.selected');
      if (prevSelected) {
        prevSelected.classList.remove('selected');
      }
      updatedItem.classList.add('selected');
    }

    // Make sure we don't lose focus or cursor position
    mgIdInput.focus();
    mgIdInput.setSelectionRange(cursorPosition, cursorPosition);
  }

  // Validate ID when the field loses focus (more comprehensive validation)
  function validateIdOnBlur() {
    if (!selectedMgId || !currentData) return;

    const newId = mgIdInput.value.trim();

    // Check for empty ID
    if (!newId) {
      alert('ID cannot be empty');

      // Find the management group with the original ID (it will now have the selectedMgId value)
      const currentMg = currentData.management_groups.find(mg => mg.id === selectedMgId);
      if (currentMg) {
        mgIdInput.value = currentMg.id;
      }
      return;
    }

    // Check if ID exists elsewhere in the data model
    if (currentData.management_groups.some(mg => mg.id === newId && mg.id !== selectedMgId)) {
      alert('A management group with this ID already exists');

      // Find the management group with the original ID
      const currentMg = currentData.management_groups.find(mg => mg.id === selectedMgId);
      if (currentMg) {
        mgIdInput.value = currentMg.id;
      }

      // Reset the tree view to reflect the original ID
      renderManagementGroups();

      // Reselect the node with the right ID
      selectManagementGroup(selectedMgId);
      return;
    }

    // No need to update the tree view again if validation passes,
    // as we've been updating it in real-time
  }

  // Load default ALZ management groups
  function loadDefaultAlz() {
    currentData = {
      "$schema": "https://raw.githubusercontent.com/Azure/Azure-Landing-Zones-Library/main/schemas/architecture_definition.json",
      "name": "alz",
      "management_groups": [
        {
          "archetypes": ["root"],
          "display_name": "Azure Landing Zones",
          "exists": false,
          "id": "alz",
          "parent_id": null
        },
        {
          "archetypes": ["platform"],
          "display_name": "Platform",
          "exists": false,
          "id": "platform",
          "parent_id": "alz"
        },
        {
          "archetypes": ["landing_zones"],
          "display_name": "Landing zones",
          "exists": false,
          "id": "landingzones",
          "parent_id": "alz"
        },
        {
          "archetypes": ["corp"],
          "display_name": "Corp",
          "exists": false,
          "id": "corp",
          "parent_id": "landingzones"
        },
        {
          "archetypes": ["online"],
          "display_name": "Online",
          "exists": false,
          "id": "online",
          "parent_id": "landingzones"
        },
        {
          "archetypes": ["sandbox"],
          "display_name": "Sandbox",
          "exists": false,
          "id": "sandbox",
          "parent_id": "alz"
        },
        {
          "archetypes": ["management"],
          "display_name": "Management",
          "exists": false,
          "id": "management",
          "parent_id": "platform"
        },
        {
          "archetypes": ["connectivity"],
          "display_name": "Connectivity",
          "exists": false,
          "id": "connectivity",
          "parent_id": "platform"
        },
        {
          "archetypes": ["identity"],
          "display_name": "Identity",
          "exists": false,
          "id": "identity",
          "parent_id": "platform"
        },
        {
          "archetypes": ["decommissioned"],
          "display_name": "Decommissioned",
          "exists": false,
          "id": "decommissioned",
          "parent_id": "alz"
        }
      ]
    };

    // Update UI
    architectureNameInput.value = currentData.name;
    document.getElementById('download-file').disabled = false;
    renderManagementGroups();
    updateJsonPreview();
  }

  // Create new blank architecture
  function createNewArchitecture() {
    currentData = {
      "$schema": "https://raw.githubusercontent.com/Azure/Azure-Landing-Zones-Library/main/schemas/architecture_definition.json",
      "name": "new_architecture",
      "management_groups": [
        {
          "archetypes": ["empty"],
          "display_name": "Root Management Group",
          "exists": false,
          "id": "root-" + Date.now(),
          "parent_id": null
        }
      ]
    };
    renderManagementGroups();
    document.getElementById('download-file').disabled = false;
    architectureNameInput.value = currentData.name;
    updateJsonPreview();
  }

  // Update the architecture name
  function updateArchitectureName() {
    if (!currentData) return;

    const sanitizedName = sanitizeFilename(architectureNameInput.value.trim() || 'architecture');
    currentData.name = sanitizedName;
    architectureNameInput.value = sanitizedName;
    updateJsonPreview();
  }

  // Handle real-time updates when typing in architecture name field
  function handleArchitectureNameInput() {
    if (!currentData) return;

    // First validate and sanitize the input
    validateFilename();

    // Then update the data model and JSON preview
    const sanitizedName = architectureNameInput.value;
    currentData.name = sanitizedName;
    updateJsonPreview();
  }

  // Validate filename as user types
  function validateFilename() {
    if (!architectureNameInput.value.trim()) return;

    const sanitized = sanitizeFilename(architectureNameInput.value);
    if (sanitized !== architectureNameInput.value) {
      // Only update if different to avoid cursor jumping
      architectureNameInput.value = sanitized;
    }
  }

  // Sanitize a string for use in a filename
  function sanitizeFilename(name) {
    // Replace invalid filename characters with underscores
    // Valid: alphanumeric, underscore, hyphen, and period
    return name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  }

  // Handle file upload
  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        // Parse JSON
        currentData = JSON.parse(e.target.result);

        // Validate the JSON structure
        if (!currentData.management_groups || !Array.isArray(currentData.management_groups)) {
          throw new Error("Invalid JSON format: missing or invalid 'management_groups' array");
        }

        // Update UI safely
        try {
          // Set architecture name
          architectureNameInput.value = currentData.name || '';

          // Enable download button
          document.getElementById('download-file').disabled = false;

          // Render management groups
          renderManagementGroups();
          updateJsonPreview();
        } catch (renderError) {
          console.error('Error rendering data:', renderError);
          alert('Error rendering data: ' + renderError.message);
        }
      } catch (error) {
        console.error('Error processing JSON file:', error);
        alert('Invalid JSON file: ' + error.message);
        // Reset current data if parsing failed
        currentData = null;
      }
    };
    reader.readAsText(file);
  }

  // Download the edited JSON
  function downloadJson() {
    if (!currentData) return;

    // Ensure the architecture name is updated before download
    updateArchitectureName();

    const jsonString = JSON.stringify(currentData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const filename = `${currentData.name || 'architecture'}.alz_architecture_definition.json`;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  // Build hierarchical tree structure from flat list of management groups
  function buildHierarchy(managementGroups) {
    const idMap = {};
    const root = [];

    // Create a map of id to management group
    managementGroups.forEach(mg => {
      idMap[mg.id] = { ...mg, children: [] };
    });

    // Build the hierarchy
    managementGroups.forEach(mg => {
      if (mg.parent_id === null) {
        root.push(idMap[mg.id]);
      } else if (idMap[mg.parent_id]) {
        idMap[mg.parent_id].children.push(idMap[mg.id]);
      }
    });

    return root;
  }

  // Render management groups as a tree
  function renderManagementGroups() {
    if (!currentData || !currentData.management_groups) {
      mgTreeView.innerHTML = '<p>No data loaded</p>';
      return;
    }

    // Clear the tree view
    mgTreeView.innerHTML = '';

    // Add legend
    addLegend();

    // Build the hierarchy
    const hierarchy = buildHierarchy(currentData.management_groups);

    // Render the tree
    hierarchy.forEach(node => {
      renderNode(node, mgTreeView);
    });

    // Update parent select options
    updateParentOptions();
  }

  // Add legend with visual indicators
  function addLegend() {
    const legendContainer = document.createElement('div');
    legendContainer.className = 'legend-container';

    // Create "exists" legend item
    const existsItem = document.createElement('div');
    existsItem.className = 'legend-item';

    const existsIndicator = document.createElement('span');
    existsIndicator.className = 'legend-indicator exists';

    const existsText = document.createElement('span');
    existsText.textContent = 'Exists';

    existsItem.appendChild(existsIndicator);
    existsItem.appendChild(existsText);

    // Create "planned" legend item
    const plannedItem = document.createElement('div');
    plannedItem.className = 'legend-item';

    const plannedIndicator = document.createElement('span');
    plannedIndicator.className = 'legend-indicator not-exists';

    const plannedText = document.createElement('span');
    plannedText.textContent = 'Planned';

    plannedItem.appendChild(plannedIndicator);
    plannedItem.appendChild(plannedText);

    // Add items to container
    legendContainer.appendChild(existsItem);
    legendContainer.appendChild(plannedItem);

    // Add legend to tree view
    mgTreeView.appendChild(legendContainer);
  }

  // Determine if a management group can exist based on parent's existence
  function canExist(mgId) {
    if (!currentData) return false;

    const mg = currentData.management_groups.find(mg => mg.id === mgId);
    if (!mg) return false;

    // Root level management groups can always exist
    if (mg.parent_id === null) return true;

    // For non-root, check if parent exists
    const parent = currentData.management_groups.find(mg => mg.id === mg.parent_id);
    return parent ? parent.exists : false;
  }

  // Get effective existence status (considers parent existence)
  function getEffectiveExistenceStatus(mgId) {
    if (!currentData) return false;

    const mg = currentData.management_groups.find(mg => mg.id === mgId);
    if (!mg) return false;

    // A management group can only exist if both:
    // 1. It's marked as existing in the data model
    // 2. Its parent exists (or it's a root management group)
    if (!mg.exists) return false;

    // Root management groups don't need parent validation
    if (mg.parent_id === null) return true;

    // Find parent and check its existence
    const parent = currentData.management_groups.find(p => p.id === mg.parent_id);
    return parent ? parent.exists : false;
  }

  // Render a single node and its children
  function renderNode(node, container) {
    const nodeEl = document.createElement('div');
    nodeEl.classList.add('tree-item');

    // Check effective existence status (considering parent status)
    const effectivelyExists = getEffectiveExistenceStatus(node.id);

    // Add class based on effective exists property
    nodeEl.classList.add(effectivelyExists ? 'mg-exists' : 'mg-not-exists');
    nodeEl.dataset.id = node.id;

    // If data model and effective status differ, add a special class
    if (node.exists && !effectivelyExists) {
      nodeEl.classList.add('mg-exists-conflict');
    }

    // Create drag handle element
    const dragHandle = document.createElement('span');
    dragHandle.classList.add('drag-handle');
    dragHandle.innerHTML = '⋮⋮';
    dragHandle.title = 'Drag to reparent';

    // Create a status indicator
    const statusIndicator = document.createElement('span');
    statusIndicator.classList.add('mg-status-indicator');
    statusIndicator.title = effectivelyExists ?
      'Exists' :
      (node.exists ? 'Marked as exists but parent is planned' : 'Does not exist');

    // Create text element for the name and ID
    const textElement = document.createElement('span');
    textElement.classList.add('mg-label');
    textElement.textContent = `${node.display_name} (${node.id})`;

    // Append the elements in the correct order
    nodeEl.appendChild(dragHandle);
    nodeEl.appendChild(statusIndicator);
    nodeEl.appendChild(textElement);

    // Make the element draggable
    nodeEl.setAttribute('draggable', 'true');

    // Add drag event listeners
    nodeEl.addEventListener('dragstart', handleDragStart);
    nodeEl.addEventListener('dragover', handleDragOver);
    nodeEl.addEventListener('dragenter', handleDragEnter);
    nodeEl.addEventListener('dragleave', handleDragLeave);
    nodeEl.addEventListener('drop', handleDrop);
    nodeEl.addEventListener('dragend', handleDragEnd);

    nodeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      selectManagementGroup(node.id);
    });

    container.appendChild(nodeEl);

    if (node.children && node.children.length > 0) {
      const childrenContainer = document.createElement('div');
      childrenContainer.classList.add('children');
      nodeEl.appendChild(childrenContainer);

      node.children.forEach(child => {
        renderNode(child, childrenContainer);
      });
    }
  }

  // Drag and Drop Event Handlers
  function handleDragStart(e) {
    // Reset drop status at start of drag
    dropSuccessful = false;

    // Store the dragged management group ID
    draggedMgId = e.target.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedMgId);
    e.target.classList.add('dragging');

    // Add a delay to prevent immediate drag end on click
    setTimeout(() => {
      e.target.classList.add('drag-active');
    }, 0);
  }

  function handleDragOver(e) {
    if (e.preventDefault) {
      e.preventDefault(); // Allow drop
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
  }

  function handleDragEnter(e) {
    // Remove drag-over class from all items first
    document.querySelectorAll('.tree-item.drag-over').forEach(item => {
      item.classList.remove('drag-over');
    });

    // Find the tree item element (could be a child element that received the event)
    const treeItem = e.target.closest('.tree-item');
    if (treeItem) {
      // Only apply drag-over to the most specific (lowest level) item
      // This prevents multiple highlighted ancestors
      treeItem.classList.add('drag-over');

      // Stop the event from bubbling to prevent parent handlers from firing
      e.stopPropagation();
    }
  }

  function handleDragLeave(e) {
    // Find the tree item element that triggered the leave event
    const treeItem = e.target.closest('.tree-item');

    // Only remove the drag-over class if we're actually leaving the element
    // and not just moving between its children
    if (treeItem && !treeItem.contains(e.relatedTarget)) {
      treeItem.classList.remove('drag-over');
    }
  }

  function handleDrop(e) {
    e.stopPropagation(); // Stop redirect
    e.preventDefault();

    // Remove drag-over class from all items
    document.querySelectorAll('.tree-item.drag-over').forEach(item => {
      item.classList.remove('drag-over');
    });

    // Find the tree item element (could be a child element that received the event)
    const dropTarget = e.target.closest('.tree-item');
    if (!dropTarget) {
      return false;
    }

    // Remove highlight from drop target
    dropTarget.classList.remove('drag-over');

    // Get the target management group ID (where we're dropping)
    const dropTargetId = dropTarget.dataset.id;

    // Only process if target has an ID (is a management group)
    if (!dropTargetId) {
      return false;
    }

    // Don't do anything if dropping onto itself
    if (draggedMgId === dropTargetId) {
      return false;
    }

    // Prevent a management group from becoming its own ancestor
    if (wouldCreateCycle(draggedMgId, dropTargetId)) {
      alert("Cannot move a management group to one of its descendants.");
      return false;
    }

    // Change the parent ID of the dragged management group
    updateMgParent(draggedMgId, dropTargetId);

    // Mark the drop as successful
    dropSuccessful = true;

    // Re-render the tree
    renderManagementGroups();

    // Keep the previously selected management group selected
    if (selectedMgId) {
      selectManagementGroup(selectedMgId);
    }

    return false;
  }

  function handleDragEnd(e) {
    // Clean up visual states - ensure all drag-over classes are removed
    document.querySelectorAll('.tree-item').forEach(item => {
      item.classList.remove('drag-over');
      item.classList.remove('dragging');
      item.classList.remove('drag-active');
    });

    // If the drop was not successful (not on a valid target), just leave everything as is
    // No need to re-render or modify the data

    // Reset drag state
    draggedMgId = null;
    dropSuccessful = false;
  }

  // Check if making dropTargetId the parent of draggedMgId would create a cycle
  function wouldCreateCycle(draggedId, dropTargetId) {
    // Check if drop target is a descendant of dragged item
    let currentId = dropTargetId;
    const visited = new Set();

    while (currentId) {
      if (visited.has(currentId)) {
        // Cycle detected (shouldn't happen, but just in case)
        return true;
      }
      visited.add(currentId);

      if (currentId === draggedId) {
        // The drop target is a descendant of the dragged item
        return true;
      }

      // Move up to parent
      const parent = currentData.management_groups.find(mg => mg.id === currentId);
      currentId = parent ? parent.parent_id : null;
    }

    return false;
  }

  // Update the parent of a management group
  function updateMgParent(mgId, newParentId) {
    const mgIndex = currentData.management_groups.findIndex(mg => mg.id === mgId);
    if (mgIndex === -1) return;

    // Update the parent_id
    currentData.management_groups[mgIndex].parent_id = newParentId;
    updateJsonPreview();
  }

  // Select a management group for editing
  function selectManagementGroup(id) {
    // Clear previous selection
    const prevSelected = document.querySelector('.tree-item.selected');
    if (prevSelected) {
      prevSelected.classList.remove('selected');
    }

    // Set new selection
    selectedMgId = id;

    // Highlight selected item
    const selectedItem = document.querySelector(`.tree-item[data-id="${id}"]`);
    if (selectedItem) {
      selectedItem.classList.add('selected');
    }

    // Find the management group data
    const mg = currentData.management_groups.find(mg => mg.id === id);
    if (mg) {
      // Set flag to prevent event triggers during form population
      isUpdating = true;

      // Populate the form
      // Don't update ID field if it's currently focused to avoid interrupting typing
      if (document.activeElement !== mgIdInput) {
        mgIdInput.value = mg.id;
      }
      mgDisplayNameInput.value = mg.display_name;
      mgParentIdSelect.value = mg.parent_id === null ? 'null' : mg.parent_id;

      // Clear archetype input and render tags instead
      mgArchetypesInput.value = '';
      renderArchetypeTags(mg.archetypes);

      mgExistsCheckbox.checked = mg.exists;

      // Clear flag
      isUpdating = false;

      // Show the form
      noSelection.style.display = 'none';
      editForm.style.display = 'block';
    }
  }

  // Add a new management group
  function addNewManagementGroup() {
    const newMg = {
      archetypes: ["empty"],
      display_name: "New Management Group",
      exists: false,
      id: "new-mg-" + Date.now(),
      parent_id: null
    };

    currentData.management_groups.push(newMg);
    renderManagementGroups();
    selectManagementGroup(newMg.id);
    updateJsonPreview();
  }

  // Delete the selected management group
  function deleteManagementGroup() {
    if (!selectedMgId || !currentData) return;

    // Check if there are any child management groups
    const hasChildren = currentData.management_groups.some(mg => mg.parent_id === selectedMgId);
    if (hasChildren) {
      alert('Cannot delete a management group with children. Please reassign or delete the children first.');
      return;
    }

    // Remove the management group
    currentData.management_groups = currentData.management_groups.filter(mg => mg.id !== selectedMgId);

    // Reset selection
    selectedMgId = null;
    noSelection.style.display = 'block';
    editForm.style.display = 'none';

    renderManagementGroups();
    updateJsonPreview();
  }

  // Update parent select options - with additional error handling
  function updateParentOptions() {
    if (!mgParentIdSelect) {
      console.error('Parent ID select element not found');
      return;
    }

    try {
      mgParentIdSelect.innerHTML = '<option value="null">None (Root)</option>';

      if (currentData && currentData.management_groups) {
        currentData.management_groups.forEach(mg => {
          const option = document.createElement('option');
          option.value = mg.id;
          option.textContent = `${mg.display_name} (${mg.id})`;
          mgParentIdSelect.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Error updating parent options:', error);
    }
  }

  // Make dropzone cover entire tree view area to prevent dropping outside valid targets
  function setupDropzone() {
    // Add event listeners to the tree container to catch drops that miss targets
    mgTreeView.addEventListener('dragover', function (e) {
      e.preventDefault(); // Allow dropping
      return false;
    });

    mgTreeView.addEventListener('drop', function (e) {
      // If the drop is not on a management group item, prevent any action
      if (!e.target.classList.contains('tree-item') &&
        !e.target.closest('.tree-item')) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }

  // Update the JSON preview
  function updateJsonPreview() {
    if (!currentData) {
      jsonPreview.innerHTML = 'No data loaded yet.';
      return;
    }

    const jsonString = JSON.stringify(currentData, null, 2)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+\.?\d*(?:[eE][+\-]?\d+)?)/g, match => {
        let cls = 'json-number';
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? 'json-key' : 'json-string';
        } else if (/true|false/.test(match)) {
          cls = 'json-boolean';
        } else if (/null/.test(match)) {
          cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
      });

    jsonPreview.innerHTML = jsonString;
  }

  // JSON syntax highlighting
  function syntaxHighlight(json) {
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
          match = match.replace(':', '');
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return '<span class="' + cls + '">' + match + '</span>';
    });
  }

  // Add CSS for conflict indication
  const style = document.createElement('style');
  style.textContent = `
    .mg-exists-conflict .mg-status-indicator {
      border: 2px solid #dc3545 !important;
      position: relative;
    }
    .mg-exists-conflict .mg-status-indicator::after {
      content: "!";
      position: absolute;
      color: #dc3545;
      font-weight: bold;
      font-size: 10px;
      top: -5px;
      right: -5px;
    }
  `;
  document.head.appendChild(style);

  // Initialize
  renderManagementGroups();
  setupDropzone();
  updateJsonPreview();
});
