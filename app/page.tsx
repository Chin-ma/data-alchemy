// app/page.tsx
'use client'; // This directive is necessary for client-side components in App Router

import { useState, useEffect, ChangeEvent, MouseEvent } from 'react';
import * as XLSX from 'xlsx'; // Import xlsx library for parsing
import Papa from 'papaparse'; // Import papaparse for CSV parsing
import VisualizationDashboard from '../components/VisualizationDashboard'; // Import the new component

// --- Type Definitions ---
interface CommonDataFields {
  _id: string;
  __v?: number;
  _validationErrors?: string[] | null;
  _filteredOut?: boolean;
  [key: string]: any; // Allow arbitrary properties
}

interface ClientData extends CommonDataFields {
  ClientID: string | number;
  ClientName?: string;
  PriorityLevel?: number;
  RequestedTaskIDs?: string[]; // Assuming this is an array after normalization
  AttributesJSON?: Record<string, any>; // Assuming this is an object after normalization
}

interface WorkerData extends CommonDataFields {
  WorkerID: string | number;
  WorkerName?: string;
  Skills?: string[];
  AvailableSlots?: number[]; // Assuming this is an array after normalization
  MaxLoadPerPhase?: number;
}

interface TaskData extends CommonDataFields {
  TaskID: string | number;
  TaskName?: string;
  Duration?: number;
  RequiredSkills?: string[]; // Assuming this is an array after normalization
  PreferredPhases?: number[]; // Assuming this is an array after normalization
  MaxConcurrent?: number;
  AttributesJSON?: Record<string, any>; // Assuming this is an object after normalization
  Category?: string; // Added from rule application
}

type DataRow = ClientData | WorkerData | TaskData;
type EntityType = 'clients' | 'workers' | 'tasks';
type ActiveView = 'table' | 'visualization'; // New type for view selection

interface EditingCellState {
  rowIndex: number;
  colName: string;
  entityType: EntityType;
}

interface AISuggestion {
  field: string;
  value: string | number | boolean | Record<string, any> | Array<any> | null;
}
// --- End Type Definitions ---


export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [clientsData, setClientsData] = useState<ClientData[]>([]);
  const [workersData, setWorkersData] = useState<WorkerData[]>([]);
  const [tasksData, setTasksData] = useState<TaskData[]>([]);
  const [activeTab, setActiveTab] = useState<EntityType>('clients');
  const [editingCell, setEditingCell] = useState<EditingCellState | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('table'); // New state for view

  // State for AI suggestions
  const [showSuggestionsModal, setShowSuggestionsModal] = useState<boolean>(false);
  const [currentSuggestions, setCurrentSuggestions] = useState<AISuggestion[]>([]);
  const [currentRowForSuggestions, setCurrentRowForSuggestions] = useState<DataRow | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState<boolean>(false);
  const [aiMessage, setAiMessage] = useState<string>('');

  // State for Natural Language to Rule
  const [nlRuleInput, setNlRuleInput] = useState<string>('');
  const [nlRuleMessage, setNlRuleMessage] = useState<string>('');
  const [loadingNlRule, setLoadingNlRule] = useState<boolean>(false);

  // State for Apply Rules
  const [applyingRules, setApplyingRules] = useState<boolean>(false);
  const [applyRulesMessage, setApplyRulesMessage] = useState<string>('');


  // Fetch data on component mount (or after successful upload)
  useEffect(() => {
    fetchData('clients', setClientsData);
    fetchData('workers', setWorkersData);
    fetchData('tasks', setTasksData);
  }, []);

  const fetchData = async (entity: EntityType, setData: React.Dispatch<React.SetStateAction<any[]>>) => {
    try {
      const response = await fetch(`/api/data/${entity}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${entity} data.`);
      }
      const data = await response.json();
      setData(data.data); // Assuming the API returns { data: [...] }
    } catch (error: any) {
      console.error(`Error fetching ${entity} data:`, error);
      setMessage(`Error loading ${entity} data: ${error.message}`);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
      setMessage('');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage('Please select a file first.');
      return;
    }

    setLoading(true);
    setMessage('Uploading...');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`Success: ${data.message}`);
        // Refresh data after successful upload
        fetchData('clients', setClientsData);
        fetchData('workers', setWorkersData);
        fetchData('tasks', setTasksData);
        setSelectedFile(null); // Clear selected file after successful upload
      } else {
        setMessage(`Error: ${data.message || 'File upload failed.'}`);
      }
    } catch (error: any) {
      setMessage(`Error: ${error.message || 'Network error.'}`);
    } finally {
      setLoading(false);
    }
  };

  // Function to handle cell content changes
  const handleCellEdit = async (rowIndex: number, colName: string, oldValue: any, newValue: string, entityType: EntityType) => {
    // Only proceed if value has actually changed
    if (oldValue === newValue) {
      setEditingCell(null);
      return;
    }

    const currentData = {
      'clients': clientsData,
      'workers': workersData,
      'tasks': tasksData,
    }[entityType];

    const currentItem: DataRow = currentData[rowIndex];
    const itemId = currentItem._id; // Get the MongoDB document ID

    // Create a copy of the item and update the specific field
    const updatedItem = { ...currentItem, [colName]: newValue };

    // Remove _validationErrors from the updated item before sending to backend
    // Backend will re-validate and return new errors if any
    const { _validationErrors, ...itemToSend } = updatedItem;


    try {
      const response = await fetch(`/api/data/${entityType}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...itemToSend, _id: itemId }),
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(`Successfully updated ${colName} for ${entityType} record.`);
        // Re-fetch data to get updated validation status from backend
        fetchData(entityType, {
          'clients': setClientsData,
          'workers': setWorkersData,
          'tasks': setTasksData,
        }[entityType]);
      } else {
        setMessage(`Error updating: ${result.message || 'Unknown error'}`);
        // If there's an error, revert the cell in UI or show specific feedback
        // For now, re-fetching will also revert if the update didn't go through
      }
    } catch (error: any) {
      setMessage(`Network error during update: ${error.message}`);
    } finally {
      setEditingCell(null); // Exit editing mode
    }
  };


  // Function to request AI suggestions
  const handleGetAISuggestions = async (row: DataRow, entityType: EntityType) => {
    setLoadingSuggestions(true);
    setAiMessage('');
    setCurrentSuggestions([]);
    setCurrentRowForSuggestions(row);
    setShowSuggestionsModal(true);

    try {
      const response = await fetch('/api/ai-suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entityType, rowData: row }),
      });

      const result = await response.json();

      if (response.ok) {
        if (result.suggestions && result.suggestions.length > 0) {
          setCurrentSuggestions(result.suggestions);
          setAiMessage('AI suggestions received.');
        } else {
          setAiMessage('AI found no valid suggestions for this row.');
        }
      } else {
        setAiMessage(`Error from AI: ${result.message || 'Unknown AI error.'}`);
      }
    } catch (error: any) {
      setAiMessage(`Network error contacting AI: ${error.message}`);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Function to apply an AI suggestion
  const applySuggestion = async (suggestion: AISuggestion) => {
    if (!currentRowForSuggestions || !suggestion.field) {
      setMessage('No row or suggestion selected to apply.');
      return;
    }

    const { _id } = currentRowForSuggestions;
    const updatedValue = suggestion.value;

    // Before sending to backend, ensure proper type for complex fields
    // Frontend should send primitive types (string, number, boolean) for simplicity
    // and let backend validation/normalization handle complex types (JSON string for object/array)
    let valueToSend: string | number | boolean | Array<any> | Record<string, any> | null = updatedValue;
    if (typeof updatedValue === 'object' && updatedValue !== null) {
      valueToSend = JSON.stringify(updatedValue);
    }

    try {
      const response = await fetch(`/api/data/${activeTab}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ _id: _id, [suggestion.field]: valueToSend }),
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(`Applied AI suggestion for ${suggestion.field}.`);
        // Re-fetch data for the active tab to get updated validation status
        fetchData(activeTab, {
          'clients': setClientsData,
          'workers': setWorkersData,
          'tasks': setTasksData,
        }[activeTab]);
        setShowSuggestionsModal(false); // Close modal after applying
      } else {
        setMessage(`Failed to apply suggestion: ${result.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      setMessage(`Network error applying suggestion: ${error.message}`);
    } finally {
      setEditingCell(null); // Exit editing mode
    }
  };

  const closeSuggestionsModal = () => {
    setShowSuggestionsModal(false);
    setCurrentSuggestions([]);
    setCurrentRowForSuggestions(null);
    setAiMessage('');
  };

  // --- Export Functions ---
  const handleExportCleanedData = async (format: 'csv' | 'xlsx') => {
    try {
      setMessage(`Preparing to export ${activeTab} data as ${format.toUpperCase()}...`);
      const response = await fetch(`/api/export-data?entity=${activeTab}&format=${format}`);

      if (!response.ok) {
        throw new Error(`Failed to export data: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeTab}_cleaned.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setMessage(`Successfully exported ${activeTab} data as ${format.toUpperCase()}.`);
    } catch (error: any) {
      console.error('Export data error:', error);
      setMessage(`Error exporting data: ${error.message}`);
    }
  };

  const handleExportRules = async () => {
    try {
      setMessage('Preparing to export rules.json...');
      const response = await fetch('/api/export-rules');

      if (!response.ok) {
        throw new Error(`Failed to export rules: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rules.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setMessage('Successfully exported rules.json.');
    } catch (error: any) {
      console.error('Export rules error:', error);
      setMessage(`Error exporting rules: ${error.message}`);
    }
  };
  // --- End Export Functions ---

  // --- Natural Language Rule Functions ---
  const handleNlRuleConvert = async () => {
    if (!nlRuleInput.trim()) {
      setNlRuleMessage('Please enter a rule in natural language.');
      return;
    }

    setLoadingNlRule(true);
    setNlRuleMessage('Converting rule using AI...');

    try {
      const response = await fetch('/api/nl-to-rule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ naturalLanguageText: nlRuleInput }),
      });

      const result = await response.json();

      if (response.ok) {
        setNlRuleMessage(`Rule converted and saved successfully: "${result.rule.ruleName}"`);
        setNlRuleInput(''); // Clear input
      } else {
        setNlRuleMessage(`Error: ${result.message || 'Failed to convert rule.'}`);
      }
    } catch (error: any) {
      setNlRuleMessage(`Network error during rule conversion: ${error.message}`);
    } finally {
      setLoadingNlRule(false);
    }
  };
  // --- End Natural Language Rule Functions ---

  // --- Apply Rules Function ---
  const handleApplyRules = async () => {
    setApplyingRules(true);
    setApplyRulesMessage('Applying stored rules to all data...');
    try {
      const response = await fetch('/api/apply-rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}), // No specific payload needed for now
      });

      const result = await response.json();

      if (response.ok) {
        setApplyRulesMessage(`Rules applied successfully. Clients Modified: ${result.results.clients.modifiedCount}, Workers Modified: ${result.results.workers.modifiedCount}, Tasks Modified: ${result.results.tasks.modifiedCount}.`);
        // Re-fetch all data to show the changes immediately
        fetchData('clients', setClientsData);
        fetchData('workers', setWorkersData);
        fetchData('tasks', setTasksData);
      } else {
        setApplyRulesMessage(`Error applying rules: ${result.message || 'Unknown error.'}`);
      }
    } catch (error: any) {
      setApplyRulesMessage(`Network error during rule application: ${error.message}`);
    } finally {
      setApplyingRules(false);
    }
  };
  // --- End Apply Rules Function ---


  const renderTable = (data: DataRow[], entityName: EntityType, setData: React.Dispatch<React.SetStateAction<any[]>>) => {
    if (!data || data.length === 0) {
      return <p className="text-gray-600 text-center">No {entityName} data uploaded yet.</p>;
    }

    // Get all unique keys from all objects to form headers
    const allKeys = new Set<string>();
    data.forEach(row => {
      Object.keys(row).forEach(key => {
        if (key !== '_id' && key !== '__v' && key !== '_filteredOut') { // Exclude internal MongoDB fields and filteredOut
          allKeys.add(key);
        }
      });
    });
    const headers = Array.from(allKeys);

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200 rounded-md shadow-sm">
          <thead className="bg-gray-50">
            <tr>
              {headers.map((header, index) => (
                <th key={index} className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {header}
                </th>
              ))}
              <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((row, rowIndex) => {
              const hasErrors = row._validationErrors && row._validationErrors.length > 0;
              // Skip rows marked as _filteredOut by rules
              if (row._filteredOut) return null;

              return (
                <tr key={row._id || rowIndex}> {/* Use MongoDB _id if available */}
                  {headers.map((header, colIndex) => {
                    const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.colName === header && editingCell?.entityType === entityName;
                    // const cellErrors = row._validationErrors && row._validationErrors.filter(error => error.includes(header)); // Filter errors relevant to this column
                    const cellErrors = row._validationErrors ? row._validationErrors.filter((error: string) => error.includes(header)) : [];

                    let displayValue = row[header];
                    if (typeof displayValue === 'object' && displayValue !== null) {
                      displayValue = JSON.stringify(displayValue);
                    } else if (displayValue === undefined || displayValue === null) {
                      displayValue = ''; // Display empty string for undefined/null values
                    }

                    return (
                      <td
                        key={colIndex}
                        className={`py-3 px-4 text-sm text-gray-800 border-r border-gray-200 last:border-r-0
                                    ${hasErrors && cellErrors.length > 0 ? 'bg-red-100' : ''}`}
                        onClick={() => setEditingCell({ rowIndex, colName: header, entityType: entityName })}
                        title={cellErrors && cellErrors.length > 0 ? cellErrors.join(', ') : ''}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            defaultValue={displayValue}
                            onBlur={(e: React.FocusEvent<HTMLInputElement>) => handleCellEdit(rowIndex, header, displayValue, e.target.value, entityName)}
                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur(); // Trigger onBlur to save
                              }
                            }}
                            className="w-full p-1 -my-1 -mx-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                        ) : (
                          <span className="block min-w-[50px] min-h-[20px]">{displayValue}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-3 px-4 text-sm text-gray-800">
                    {hasErrors && (
                      <button
                        onClick={(e: MouseEvent<HTMLButtonElement>) => handleGetAISuggestions(row, entityName)}
                        className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-1 px-3 rounded-full text-xs shadow-md transition duration-200 ease-in-out"
                        disabled={loadingSuggestions && currentRowForSuggestions?._id === row._id}
                      >
                        {loadingSuggestions && currentRowForSuggestions?._id === row._id ? 'AI Thinking...' : 'Suggest Fixes'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <script src="https://cdn.tailwindcss.com"></script>
      <style>{`
        body {
          font-family: 'Inter', sans-serif;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        .modal-content {
          background-color: white;
          padding: 2rem;
          border-radius: 0.75rem;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
        }
      `}</style>
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-8xl">
        <h1 className="text-4xl font-extrabold text-center text-gray-900 mb-4">
          Data Alchemist
        </h1>
        <p className="text-center text-gray-600 mb-8 max-w-2xl mx-auto">
          Upload your CSV or XLSX files for clients, workers, and tasks. The system will process and display your data here.
        </p>

        {/* File Upload Section */}
        <div className="mb-10 p-6 border border-gray-200 rounded-lg bg-gray-50">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Upload Data Files</h2>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <label htmlFor="file-upload" className="flex-grow block text-sm font-medium text-gray-700 sr-only">
              Choose File
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".csv, .xlsx"
              onChange={handleFileChange}
              className="flex-grow block w-full sm:w-auto text-sm text-gray-900
                         file:mr-4 file:py-2 file:px-4
                         file:rounded-full file:border-0
                         file:text-sm file:font-semibold
                         file:bg-blue-50 file:text-blue-700
                         hover:file:bg-blue-100 cursor-pointer"
            />
            <button
              onClick={handleUpload}
              disabled={!selectedFile || loading}
              className={`py-2 px-6 rounded-full text-white font-semibold transition duration-300 ease-in-out
                          ${selectedFile && !loading ? 'bg-blue-600 hover:bg-blue-700 shadow-md' : 'bg-blue-400 cursor-not-allowed'}
                          ${loading ? 'animate-pulse' : ''}`}
            >
              {loading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>

          {selectedFile && (
            <p className="text-sm text-gray-500 mt-4">
              Selected file: <span className="font-medium text-gray-800">{selectedFile.name}</span>
            </p>
          )}

          {message && (
            <div
              className={`mt-4 p-3 rounded-md text-sm text-center
                          ${message.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}
            >
              {message}
            </div>
          )}
        </div>

        {/* Natural Language to Rule Section */}
        <div className="mb-10 p-6 border border-gray-200 rounded-lg bg-yellow-50">
          <h2 className="text-2xl font-semibold text-yellow-800 mb-4">Natural Language to Rule</h2>
          <p className="text-gray-700 mb-4">
            Type a rule in plain English (e.g., "If cost is more than 10000 for a task, set its category to high-cost").
            AI will convert it to a structured rule.
          </p>
          <textarea
            className="w-full p-3 border text-black border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 mb-4 resize-y"
            rows={3} // Changed to number
            placeholder="Enter your rule here..."
            value={nlRuleInput}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNlRuleInput(e.target.value)}
            disabled={loadingNlRule}
          ></textarea>
          <button
            onClick={handleNlRuleConvert}
            disabled={!nlRuleInput.trim() || loadingNlRule}
            className={`w-full py-3 px-4 rounded-full text-white font-semibold transition duration-300 ease-in-out
                        ${nlRuleInput.trim() && !loadingNlRule ? 'bg-yellow-600 hover:bg-yellow-700 shadow-md' : 'bg-yellow-400 cursor-not-allowed'}
                        ${loadingNlRule ? 'animate-pulse' : ''}`}
          >
            {loadingNlRule ? 'Converting...' : 'Convert & Save Rule'}
          </button>
          {nlRuleMessage && (
            <div
              className={`mt-4 p-3 rounded-md text-sm text-center
                          ${nlRuleMessage.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}
            >
              {nlRuleMessage}
            </div>
          )}
        </div>


        {/* Export and Apply Rules Section */}
        <div className="mb-10 p-6 border border-gray-200 rounded-lg bg-green-50">
          <h2 className="text-2xl font-semibold text-green-800 mb-4">Data Operations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Export Buttons */}
            <div className="col-span-1 md:col-span-2 text-lg font-semibold text-gray-700">Export Cleaned Data & Rules:</div>
            <button
              onClick={() => handleExportCleanedData('csv')}
              className="py-2 px-6 rounded-full text-white font-semibold bg-green-600 hover:bg-green-700 shadow-md transition duration-300 ease-in-out"
            >
              Export {activeTab} as CSV
            </button>
            <button
              onClick={() => handleExportCleanedData('xlsx')}
              className="py-2 px-6 rounded-full text-white font-semibold bg-green-600 hover:bg-green-700 shadow-md transition duration-300 ease-in-out"
            >
              Export {activeTab} as XLSX
            </button>
            <button
              onClick={handleExportRules}
              className="py-2 px-6 rounded-full text-white font-semibold bg-green-600 hover:bg-green-700 shadow-md transition duration-300 ease-in-out"
            >
              Export rules.json
            </button>

            {/* Apply Rules Button */}
            <div className="col-span-1 md:col-span-2 border-t border-gray-300 pt-4 mt-4 text-lg font-semibold text-gray-700">Apply Stored Rules:</div>
            <button
              onClick={handleApplyRules}
              disabled={applyingRules}
              className={`col-span-1 md:col-span-2 py-3 px-6 rounded-full text-white font-semibold transition duration-300 ease-in-out
                          ${!applyingRules ? 'bg-blue-600 hover:bg-blue-700 shadow-md' : 'bg-blue-400 cursor-not-allowed'}
                          ${applyingRules ? 'animate-pulse' : ''}`}
            >
              {applyingRules ? 'Applying Rules...' : 'Apply Stored Rules to All Data'}
            </button>
            {applyRulesMessage && (
              <div
                className={`col-span-1 md:col-span-2 mt-4 p-3 rounded-md text-sm text-center
                            ${applyRulesMessage.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}
              >
                {applyRulesMessage}
              </div>
            )}
          </div>
        </div>


        {/* View Selection Tabs */}
        <div className="flex mb-6 border-b border-gray-200 justify-center">
          <button
            className={`py-2 px-4 text-sm font-medium rounded-t-lg transition duration-200 ease-in-out
                        ${activeView === 'table' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'}`}
            onClick={() => setActiveView('table')}
          >
            Data Table
          </button>
          <button
            className={`py-2 px-4 text-sm font-medium rounded-t-lg transition duration-200 ease-in-out
                        ${activeView === 'visualization' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'}`}
            onClick={() => setActiveView('visualization')}
          >
            Visualizations
          </button>
        </div>


        {/* Conditional Rendering of Data Table or Visualizations */}
        {activeView === 'table' && (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Uploaded Data</h2>
            <div className="flex mb-6 border-b border-gray-200">
              <button
                className={`py-2 px-4 text-sm font-medium rounded-t-lg transition duration-200 ease-in-out
                            ${activeTab === 'clients' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'}`}
                onClick={() => setActiveTab('clients')}
              >
                Clients
              </button>
              <button
                className={`py-2 px-4 text-sm font-medium rounded-t-lg transition duration-200 ease-in-out
                            ${activeTab === 'workers' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'}`}
                onClick={() => setActiveTab('workers')}
              >
                Workers
              </button>
              <button
                className={`py-2 px-4 text-sm font-medium rounded-t-lg transition duration-200 ease-in-out
                            ${activeTab === 'tasks' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'}`}
                onClick={() => setActiveTab('tasks')}
              >
                Tasks
              </button>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-inner border border-gray-100">
              {/* Pass setData function to renderTable for re-fetching */}
              {activeTab === 'clients' && renderTable(clientsData, 'clients', setClientsData)}
              {activeTab === 'workers' && renderTable(workersData, 'workers', setWorkersData)}
              {activeTab === 'tasks' && renderTable(tasksData, 'tasks', setTasksData)}
            </div>
          </>
        )}

        {activeView === 'visualization' && (
          <VisualizationDashboard
            data={
              activeTab === 'clients' ? clientsData :
              activeTab === 'workers' ? workersData :
              tasksData
            }
            entityType={activeTab}
          />
        )}
      </div>

      {/* AI Suggestions Modal */}
      {showSuggestionsModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="text-xl font-bold mb-4 text-gray-800">AI Suggestions for Row ID: {currentRowForSuggestions?._id}</h3>
            {aiMessage && (
              <p className={`text-sm mb-4 ${aiMessage.startsWith('Error') ? 'text-red-600' : 'text-gray-600'}`}>
                {aiMessage}
              </p>
            )}

            {loadingSuggestions ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="ml-3 text-gray-700">Getting suggestions...</p>
              </div>
            ) : (
              <>
                {currentSuggestions.length > 0 ? (
                  <ul className="space-y-3 mb-6">
                    {currentSuggestions.map((sug, index) => (
                      <li key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-md bg-gray-50">
                        <span className="text-gray-700 text-sm">
                          Set <strong className="font-semibold">{sug.field}</strong> to{' '}
                          <code className="bg-gray-200 px-1 py-0.5 rounded text-xs font-mono">
                            {typeof sug.value === 'object' ? JSON.stringify(sug.value) : String(sug.value)}
                          </code>
                        </span>
                        <button
                          onClick={() => applySuggestion(sug)}
                          className="bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded-full text-xs shadow-sm transition duration-200 ease-in-out"
                        >
                          Apply
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  !aiMessage.startsWith('Error') && <p className="text-gray-600">No suggestions available or AI found no valid fixes for the current errors.</p>
                )}
              </>
            )}

            <button
              onClick={closeSuggestionsModal}
              className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-full shadow-md transition duration-300 ease-in-out"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
