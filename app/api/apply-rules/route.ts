import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongo";
import { validateData } from "@/lib/validators";
import { ObjectId } from "mongodb";

interface Condition {
  field: string;
  operator: string;
  value: any;
}

interface Action {
  type: string;
  field: string;
  value?: any;
  additionalFields?: Record<string, any>;
}

interface Rule {
  _id: ObjectId;
  entityType: string;
  enabled: boolean;
  priority?: number;
  conditions: Condition[];
  actions: Action[];
}

const getNestedProperty = (obj: Record<string, any>, path: string): any => {
  return path.split(".").reduce((current, key) => {
    return current && typeof current === "object" ? current[key] : undefined;
  }, obj);
};

const setNestedProperty = (
  obj: Record<string, any>,
  path: string,
  value: any
): Record<string, any> => {
  const parts = path.split(".");
  const newObj = { ...obj };
  let current = newObj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === parts.length - 1) {
      current[part] = value;
    } else {
      if (typeof current[part] !== "object" || current[part] === null) {
        current[part] = {};
      }
      current = current[part];
    }
  }
  return newObj;
};

const isValidJsonString = (str: string): boolean => {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
};

const evaluateCondition = (record: Record<string, any>, condition: Condition): boolean => {
  const recordValue = getNestedProperty(record, condition.field);

  if (condition.operator === "is_string") {
    return typeof recordValue === "string" && condition.value === true;
  }
  if (condition.operator === "is_not_json") {
    return (
      typeof recordValue === "string" &&
      !isValidJsonString(recordValue) &&
      condition.value === true
    );
  }
  if (condition.operator === "exists") {
    return (
      (recordValue !== undefined && recordValue !== null) === condition.value
    );
  }

  if (recordValue === undefined || recordValue === null) return false;

  let val1: any = recordValue;
  let val2: any = condition.value;

  if (
    typeof val1 === "string" && !isNaN(Number(val1)) && typeof val2 === "number"
  ) {
    val1 = Number(val1);
  }
  if (
    typeof val2 === "string" && !isNaN(Number(val2)) && typeof val1 === "number"
  ) {
    val2 = Number(val2);
  }
  if (
    typeof val1 === "string" && ["true", "false"].includes(val1.toLowerCase()) &&
    typeof val2 === "boolean"
  ) {
    val1 = val1.toLowerCase() === "true";
  }
  if (
    typeof val2 === "string" && ["true", "false"].includes(val2.toLowerCase()) &&
    typeof val1 === "boolean"
  ) {
    val2 = val2.toLowerCase() === "true";
  }

  switch (condition.operator) {
    case "eq": return val1 === val2;
    case "ne": return val1 !== val2;
    case "gt": return val1 > val2;
    case "lt": return val1 < val2;
    case "gte": return val1 >= val2;
    case "lte": return val1 <= val2;
    case "contains":
      return typeof val1 === "string" && typeof val2 === "string"
        ? val1.includes(val2)
        : Array.isArray(val1) && val1.includes(val2);
    case "startsWith": return typeof val1 === "string" && val1.startsWith(val2);
    case "endsWith": return typeof val1 === "string" && val1.endsWith(val2);
    case "in": return Array.isArray(val2) && val2.includes(val1);
    case "nin": return Array.isArray(val2) && !val2.includes(val1);
    default: return false;
  }
};

export async function POST() {
  try {
    const { db } = await connectToDatabase();
    const rulesCollection = db.collection("rules");
    const storedRules = await rulesCollection.find({ enabled: true }).toArray();
    const entities = ["clients", "workers", "tasks"];
    const results: Record<string, any> = {};

    for (const entityType of entities) {
      const dataCollection = db.collection(entityType);
      const currentData = await dataCollection.find({}).toArray();
      const bulkOperations: any[] = [];

      for (const originalDoc of currentData) {
        let modifiedDoc = { ...originalDoc };
        const changedFields = new Set<string>();

        const applicableRules = storedRules
          .filter(rule => rule.entityType === entityType || rule.entityType === "general")
          .sort((a, b) => (b.priority || 0) - (a.priority || 0));

        for (const rule of applicableRules) {
          const conditionsMet = rule.conditions.every(condition => evaluateCondition(modifiedDoc, condition));

          if (conditionsMet) {
            for (const action of rule.actions) {
              if (action.type === "set_field") {
                modifiedDoc = setNestedProperty(modifiedDoc, action.field, action.value);
                changedFields.add(action.field);
              } else if (action.type === "mark_error") {
                if (!modifiedDoc._validationErrors) modifiedDoc._validationErrors = [];
                modifiedDoc._validationErrors.push(`${action.field}: ${action.value}`);
                changedFields.add("_validationErrors");
              } else if (action.type === "filter_out") {
                modifiedDoc._filteredOut = true;
                changedFields.add("_filteredOut");
              } else if (action.type === "wrap_string_in_json_message") {
                const fieldValue = getNestedProperty(modifiedDoc, action.field);
                if (typeof fieldValue === "string" && !isValidJsonString(fieldValue)) {
                  const jsonObject: Record<string, any> = {
                    message: fieldValue,
                    ...(action.additionalFields || {})
                  };
                  modifiedDoc = setNestedProperty(modifiedDoc, action.field, jsonObject);
                  changedFields.add(action.field);
                }
              }
            }
          }
        }

        const currentErrors = validateData(entityType, { ...modifiedDoc });
        modifiedDoc._validationErrors = currentErrors.length > 0 ? currentErrors : null;
        changedFields.add("_validationErrors");

        if (changedFields.size > 0) {
          if (modifiedDoc._filteredOut) {
            bulkOperations.push({ deleteOne: { filter: { _id: originalDoc._id } } });
          } else {
            const fieldsToSet: Record<string, any> = {};
            const fieldsToUnset: Record<string, any> = {};

            for (const field of changedFields) {
              const value = modifiedDoc[field];
              if (value === undefined || value === null) {
                fieldsToUnset[field] = "";
              } else {
                fieldsToSet[field] = value;
              }
            }

            const updateOperation: Record<string, any> = {};
            if (Object.keys(fieldsToSet).length > 0) updateOperation.$set = fieldsToSet;
            if (Object.keys(fieldsToUnset).length > 0) updateOperation.$unset = fieldsToUnset;

            if (Object.keys(updateOperation).length > 0) {
              bulkOperations.push({
                updateOne: {
                  filter: { _id: originalDoc._id },
                  update: updateOperation,
                },
              });
            }
          }
        }
      }

      if (bulkOperations.length > 0) {
        const bulkResult = await dataCollection.bulkWrite(bulkOperations);
        results[entityType] = {
          modifiedCount: bulkResult.modifiedCount,
          deletedCount: bulkResult.deletedCount,
        };
      } else {
        results[entityType] = { modifiedCount: 0, deletedCount: 0 };
      }
    }

    return NextResponse.json({ message: "Rules applied successfully to data.", results }, { status: 200 });
  } catch (error: any) {
    console.error("Error applying rules:", error);
    return NextResponse.json({ message: "Internal server error during rule application.", error: error.message }, { status: 500 });
  }
}
