// lib/validators.js

// ------------------
// Utility Functions
// ------------------

// Convert headers to lowercase and trimmed format
const normalizeHeaders = (headers) =>
  headers.map((h) => h.toLowerCase().trim());

// Parse comma-separated string into array
const parseCommaSeparated = (value) => {
  return typeof value === 'string' && value.trim()
    ? value.split(',').map((s) => s.trim()).filter((s) => s !== '')
    : [];
};

// Parse array-like or range-like strings into number array
const parsePhases = (value) => {
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((p) => typeof p === 'number')) {
      return parsed;
    }
  } catch (_) {
    // Fall back to manual parsing
  }

  if (value.includes('-')) {
    const [start, end] = value.split('-').map((s) => parseInt(s.trim()));
    if (!isNaN(start) && !isNaN(end) && start <= end) {
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
  } else {
    const numbers = value
      .split(',')
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n));
    if (numbers.length > 0) return numbers;
  }

  return null;
};

// --------------------------
// Entity Type Determination
// --------------------------

export const determineEntityType = (headers) => {
  const normalized = normalizeHeaders(headers);

  const entityMap = {
    clients: ['clientid', 'clientname', 'prioritylevel'],
    workers: ['workerid', 'workername', 'skills'],
    tasks: ['taskid', 'taskname', 'duration'],
  };

  for (const [entity, keys] of Object.entries(entityMap)) {
    if (keys.every((key) => normalized.includes(key))) return entity;
  }

  return null;
};

// --------------------------
// Validation by Entity Type
// --------------------------

const validateClient = (row, errors) => {
  if (!row.ClientID || typeof row.ClientID !== 'string' || row.ClientID.trim() === '') {
    errors.push('ClientID: Missing required value.');
  }

  const priority = parseInt(row.PriorityLevel);
  if (isNaN(priority) || priority < 1 || priority > 5) {
    errors.push('PriorityLevel: Must be an integer between 1 and 5.');
  }

  if (row.RequestedTaskIDs !== undefined) {
    const parsed = parseCommaSeparated(row.RequestedTaskIDs);
    if (!Array.isArray(parsed)) {
      errors.push('RequestedTaskIDs: Malformed list format.');
    }
  }

  if (row.AttributesJSON !== undefined) {
    if (typeof row.AttributesJSON === 'string') {
      try {
        JSON.parse(row.AttributesJSON);
      } catch {
        errors.push('AttributesJSON: Malformed JSON string.');
      }
    } else if (typeof row.AttributesJSON !== 'object') {
      errors.push('AttributesJSON: Must be a valid object or JSON string.');
    }
  }
};

const validateWorker = (row, errors) => {
  if (!row.WorkerID || typeof row.WorkerID !== 'string' || row.WorkerID.trim() === '') {
    errors.push('WorkerID: Missing required value.');
  }

  if (row.Skills !== undefined) {
    const parsed = parseCommaSeparated(row.Skills);
    if (!Array.isArray(parsed)) {
      errors.push('Skills: Malformed list format.');
    }
  }

  if (row.AvailableSlots !== undefined) {
    const parsed = parsePhases(String(row.AvailableSlots));
    if (parsed === null) {
      errors.push('AvailableSlots: Malformed list or range format.');
    }
  }

  const maxLoad = parseInt(row.MaxLoadPerPhase);
  if (isNaN(maxLoad)) {
    errors.push('MaxLoadPerPhase: Must be an integer.');
  }
};

const validateTask = (row, errors) => {
  if (!row.TaskID || typeof row.TaskID !== 'string' || row.TaskID.trim() === '') {
    errors.push('TaskID: Missing required value.');
  }

  const duration = parseInt(row.Duration);
  if (isNaN(duration) || duration < 1) {
    errors.push('Duration: Must be an integer >= 1.');
  }

  if (row.RequiredSkills !== undefined) {
    const parsed = parseCommaSeparated(row.RequiredSkills);
    if (!Array.isArray(parsed)) {
      errors.push('RequiredSkills: Malformed list format.');
    }
  }

  if (row.PreferredPhases !== undefined) {
    const parsed = parsePhases(String(row.PreferredPhases));
    if (parsed === null) {
      errors.push('PreferredPhases: Malformed list or range format.');
    }
  }

  const maxConcurrent = parseInt(row.MaxConcurrent);
  if (isNaN(maxConcurrent)) {
    errors.push('MaxConcurrent: Must be an integer.');
  }
};

// ---------------------
// Unified Validator API
// ---------------------

export const validateData = (entityType, row) => {
  const errors = [];

  // Clone the row to avoid modifying original data
  const clonedRow = structuredClone(row);

  switch (entityType) {
    case 'clients':
      validateClient(clonedRow, errors);
      break;
    case 'workers':
      validateWorker(clonedRow, errors);
      break;
    case 'tasks':
      validateTask(clonedRow, errors);
      break;
    default:
      errors.push('Unknown entity type.');
  }

  return errors;
};
