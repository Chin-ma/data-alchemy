// components/VisualizationDashboard.tsx
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

// --- Type Definitions (Should match your DataRow types in app/page.tsx) ---
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
  RequestedTaskIDs?: string[];
  AttributesJSON?: Record<string, any>;
}

interface WorkerData extends CommonDataFields {
  WorkerID: string | number;
  WorkerName?: string;
  Skills?: string[];
  AvailableSlots?: number[];
  MaxLoadPerPhase?: number;
}

interface TaskData extends CommonDataFields {
  TaskID: string | number;
  TaskName?: string;
  Duration?: number;
  RequiredSkills?: string[];
  PreferredPhases?: number[];
  MaxConcurrent?: number;
  AttributesJSON?: Record<string, any>;
  Category?: string;
}

type DataRow = ClientData | WorkerData | TaskData;
type EntityType = 'clients' | 'workers' | 'tasks';

interface VisualizationDashboardProps {
  data: DataRow[];
  entityType: EntityType;
}

// Colors for Pie Chart
const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

const VisualizationDashboard: React.FC<VisualizationDashboardProps> = ({ data, entityType }) => {

  if (!data || data.length === 0) {
    return (
      <div className="text-center p-8 text-gray-600">
        <p>No data available to visualize for {entityType}.</p>
        <p>Please upload data or apply rules first.</p>
      </div>
    );
  }

  // --- Data Transformation Functions ---

  // Generic function to count occurrences of a field
  const getCountData = (field: keyof DataRow) => {
    const counts: Record<string | number, number> = {};
    data.forEach(row => {
      const value = row[field];
      if (value !== undefined && value !== null && value !== '') {
        const key = String(value); // Convert to string for consistent keying
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  };

  // Specific function for skill counts (handles arrays)
  const getSkillsData = () => {
    const skillCounts: Record<string, number> = {};
    data.forEach(row => {
      const worker = row as WorkerData; // Type assertion
      if (worker.Skills && Array.isArray(worker.Skills)) {
        worker.Skills.forEach(skill => {
          skillCounts[skill] = (skillCounts[skill] || 0) + 1;
        });
      } else if (typeof worker.Skills === 'string') {
        // Handle comma-separated string if not normalized to array on ingest
        worker.Skills.split(',').map(s => s.trim()).filter(Boolean).forEach(skill => {
          skillCounts[skill] = (skillCounts[skill] || 0) + 1;
        });
      }
    });
    return Object.keys(skillCounts).map(key => ({ name: key, value: skillCounts[key] }));
  };

  // Specific function for AttributesJSON.cost or AttributesJSON.category
  const getNestedAttributeData = (attributePath: string) => {
    const counts: Record<string | number, number> = {};
    data.forEach(row => {
      try {
        let current: any = row;
        const parts = attributePath.split('.');
        let value: any;

        // Traverse nested object
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (current && typeof current === 'object' && !Array.isArray(current)) {
                if (typeof current[part] === 'string' && isValidJsonString(current[part]) && i < parts.length -1) {
                    // If an intermediate part is a stringified JSON, parse it for further traversal
                    current = JSON.parse(current[part]);
                } else {
                    current = current[part];
                }
            } else {
                current = undefined; // Path does not exist or is not an object
                break;
            }
        }
        value = current;

        if (value !== undefined && value !== null && value !== '') {
          const key = String(value);
          counts[key] = (counts[key] || 0) + 1;
        }
      } catch (e) {
        console.warn(`Could not parse or access nested attribute '${attributePath}' in row:`, row, e);
      }
    });
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  };

  // Helper to check if a string is valid JSON (re-used from apply-rules)
  const isValidJsonString = (str: string) => {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  };


  // --- Render Charts based on Entity Type ---
  const renderCharts = () => {
    switch (entityType) {
      case 'clients':
        const priorityData = getCountData('PriorityLevel');
        const clientRequestedTasksData = getCountData('RequestedTaskIDs'); // Could be improved if TaskIDs is an array of IDs not just count
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Client Priority Levels</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={priorityData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" name="Number of Clients" fill="#8884d8" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
             {/* Additional Client Chart Example (e.g., RequestedTaskIDs) */}
            <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">Clients by TaskIDs Requested (Raw Count)</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={clientRequestedTasksData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" name="Clients" fill="#82ca9d" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
            </div>
          </div>
        );
      case 'workers':
        const skillData = getSkillsData();
        const maxLoadData = getCountData('MaxLoadPerPhase');
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Worker Skills Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={skillData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" name="Workers" fill="#ffc658" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Worker Max Load Per Phase</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={maxLoadData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" name="Workers" fill="#ff7f50" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      case 'tasks':
        const durationData = getCountData('Duration');
        const categoryData = getNestedAttributeData('AttributesJSON.category'); // Use nested path
        const costData = getNestedAttributeData('AttributesJSON.cost'); // Use nested path

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Task Duration Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={durationData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" name="Tasks" fill="#0088FE" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Task Category Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    fill="#8884d8"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Task Cost Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={costData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" name="Tasks" fill="#FF8042" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      default:
        return <p className="text-gray-600 text-center">Select a data tab to see visualizations.</p>;
    }
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100">
      <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Data Visualizations</h2>
      {renderCharts()}
    </div>
  );
};

export default VisualizationDashboard;
