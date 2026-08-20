import { AppData, Trip, ChecklistItem } from '../types';
import { isOwnerOfTrip } from './auth';
import { downloadOrShareText } from './nativeShareDownload';
import {
  getTripMaster,
  saveTripMaster,
  getUserTripcodeMaster,
  saveUserTripcodeMaster,
  saveTripToDB,
  getUserConfig,
  saveUserConfig,
  getDeterministicUserCode
} from './db';

export interface ConflictingTrip {
  code: string;
  id: string;
  title: string;
  importedTrip: Trip;
  choice: 'overwrite' | 'keep';
}

export interface NewTripToImport {
  code: string;
  id: string;
  title: string;
  importedTrip: Trip;
}

export interface PreparedImport {
  success: boolean;
  error?: string;
  conflictingTrips: ConflictingTrip[];
  newTrips: NewTripToImport[];
  parsedData: any;
}

/**
 * Sanitizes and exports AppData as JSON backup file download.
 * Removes ownerUid, allowOthersToModify, and isJoined from all exported trips.
 */
export async function exportSanitizedAppData(appData: AppData, user: any) {
  try {
    let exportData: any = JSON.parse(JSON.stringify(appData));

    const isGoogleUser = user && user.email;
    if (!isGoogleUser) {
      delete exportData.globalChecklist;

      // Filter trips to only export locally created trips for guest user
      if (exportData.trips) {
        const localTripsOnly: { [id: string]: any } = {};
        Object.keys(exportData.trips).forEach(id => {
          const trip = exportData.trips[id];
          const isJoined = trip.isJoined === true || (trip.ownerUid && !trip.ownerUid.startsWith('guest_') && !isOwnerOfTrip(trip, user));
          if (!isJoined) {
            localTripsOnly[id] = trip;
          }
        });
        exportData.trips = localTripsOnly;
      }
    }

    // Sanitize trips by removing ownerUid, allowOthersToModify, and isJoined
    if (exportData.trips) {
      const sanitizedTrips: { [id: string]: any } = {};
      Object.keys(exportData.trips).forEach(id => {
        const trip = { ...exportData.trips[id] };
        delete trip.ownerUid;
        delete trip.allowOthersToModify;
        delete trip.isJoined;
        sanitizedTrips[id] = trip;
      });
      exportData.trips = sanitizedTrips;
    }

    const dataStr = JSON.stringify(exportData, null, 2);
    const exportFileDefaultName = `viadia_backup_${new Date().toISOString().split('T')[0]}.json`;

    await downloadOrShareText(dataStr, exportFileDefaultName, 'application/json;charset=utf-8;', {
      dialogTitle: 'Share or Save ViaDia Backup JSON'
    });
  } catch (err) {
    console.error('Export failed:', err);
  }
}

/**
 * Validates JSON backup file and prepares import plan.
 * Checks ownership in DB for signed in users.
 */
export async function validateAndPrepareImport(
  parsed: any,
  user: any,
  existingTrips: { [id: string]: Trip }
): Promise<PreparedImport> {
  if (!parsed || typeof parsed !== 'object') {
    return { success: false, error: 'Invalid backup file. Must be a JSON object.', conflictingTrips: [], newTrips: [], parsedData: null };
  }

  let tripsDict: { [id: string]: Trip } = {};
  if (parsed.trips && Array.isArray(parsed.trips)) {
    parsed.trips.forEach((t: any) => {
      if (t && (t.id || t.code)) {
        const idKey = t.id || t.code;
        tripsDict[idKey] = t;
      }
    });
    parsed.trips = tripsDict;
  } else if (parsed.trips && typeof parsed.trips === 'object') {
    tripsDict = parsed.trips;
  } else {
    return { success: false, error: 'Invalid backup schema: "trips" is missing or malformed.', conflictingTrips: [], newTrips: [], parsedData: null };
  }

  const conflictingTrips: ConflictingTrip[] = [];
  const newTrips: NewTripToImport[] = [];

  const tripsList = Object.values(tripsDict);

  for (const importedTrip of tripsList) {
    const code = (importedTrip.code || importedTrip.id || '').toUpperCase().trim();
    const tripId = importedTrip.id || code;
    const title = importedTrip.title || (importedTrip as any).destination || 'Untitled Trip';

    if (user && user.uid) {
      // Signed in user mode: check ownership in trip_master
      const masterDoc = await getTripMaster(code);

      if (masterDoc) {
        if (masterDoc.ownerUid && !isOwnerOfTrip({ ownerUid: masterDoc.ownerUid }, user)) {
          // Mapped with another user -> RAISE ERROR!
          return {
            success: false,
            error: `This trip "${title}" (code: ${code}) is owned by someone else.`,
            conflictingTrips: [],
            newTrips: [],
            parsedData: parsed
          };
        } else {
          // Already owned by this user -> CONFLICT / PROMPT
          conflictingTrips.push({
            code,
            id: tripId,
            title,
            importedTrip,
            choice: 'overwrite'
          });
        }
      } else {
        // Not in trip_master: check if present in existingTrips owned by user
        const existing = existingTrips[tripId] || Object.values(existingTrips).find(t => t.code === code);
        if (existing) {
          conflictingTrips.push({
            code,
            id: tripId,
            title,
            importedTrip,
            choice: 'overwrite'
          });
        } else {
          // New trip
          newTrips.push({
            code,
            id: tripId,
            title,
            importedTrip
          });
        }
      }
    } else {
      // Guest mode
      const existing = existingTrips[tripId] || Object.values(existingTrips).find(t => t.code === code);
      if (existing) {
        conflictingTrips.push({
          code,
          id: tripId,
          title,
          importedTrip,
          choice: 'overwrite'
        });
      } else {
        newTrips.push({
          code,
          id: tripId,
          title,
          importedTrip
        });
      }
    }
  }

  return {
    success: true,
    conflictingTrips,
    newTrips,
    parsedData: parsed
  };
}

/**
 * Executes the prepared import plan. Appends new trips and applies overwrite/keep choices.
 */
export async function executeImportPlan(
  prepared: PreparedImport,
  existingAppData: AppData,
  user: any,
  userCode: string | null
): Promise<AppData> {
  const updatedTrips: { [id: string]: Trip } = { ...existingAppData.trips };
  const effectiveUserCode = userCode || (user?.uid ? getDeterministicUserCode(user.uid) : null);

  // 1. Process New Trips
  for (const item of prepared.newTrips) {
    const trip: Trip = JSON.parse(JSON.stringify(item.importedTrip));
    if (!trip.id) trip.id = item.id;
    if (!trip.code) trip.code = item.code;

    // Remove legacy flags
    delete trip.allowOthersToModify;
    delete trip.isJoined;

    if (user && user.uid) {
      trip.ownerUid = user.uid;

      // Save trip_master entry
      await saveTripMaster(item.code, user.uid, true);

      // Add to user_tripcode_master
      if (effectiveUserCode) {
        const currentCodes = await getUserTripcodeMaster(effectiveUserCode);
        if (!currentCodes.includes(item.code)) {
          await saveUserTripcodeMaster(effectiveUserCode, [...currentCodes, item.code]);
        }
      }

      // Save trip document to DB
      await saveTripToDB(item.code, trip);
    }

    updatedTrips[trip.id] = trip;
  }

  // 2. Process Conflicting Trips based on choices
  for (const item of prepared.conflictingTrips) {
    if (item.choice === 'overwrite') {
      const trip: Trip = JSON.parse(JSON.stringify(item.importedTrip));
      if (!trip.id) trip.id = item.id;
      if (!trip.code) trip.code = item.code;

      delete trip.allowOthersToModify;
      delete trip.isJoined;

      if (user && user.uid) {
        trip.ownerUid = user.uid;
        await saveTripMaster(item.code, user.uid, true);
        await saveTripToDB(item.code, trip);
      }

      updatedTrips[trip.id] = trip;
    } else {
      // 'keep' -> do nothing, existing trip in updatedTrips remains untouched!
    }
  }

  // 3. Process Global Checklist (Append new items)
  let mergedChecklist = [...(existingAppData.globalChecklist || [])];
  if (prepared.parsedData?.globalChecklist && Array.isArray(prepared.parsedData.globalChecklist)) {
    const existingIds = new Set(mergedChecklist.map(ci => ci.id));
    const existingTasks = new Set(mergedChecklist.map(ci => (ci.task || (ci as any).text || '').toLowerCase().trim()));

    prepared.parsedData.globalChecklist.forEach((ci: ChecklistItem) => {
      const taskVal = ci.task || (ci as any).text || '';
      if (ci && taskVal && !existingIds.has(ci.id) && !existingTasks.has(taskVal.toLowerCase().trim())) {
        mergedChecklist.push({
          id: ci.id,
          task: taskVal,
          checked: !!ci.checked,
          category: ci.category || 'Packing'
        });
      }
    });
  }

  const newAppData: AppData = {
    trips: updatedTrips,
    globalChecklist: mergedChecklist
  };

  if (effectiveUserCode && user?.uid) {
    await saveUserConfig(effectiveUserCode, {
      userCode: effectiveUserCode,
      globalChecklist: mergedChecklist
    });
  }

  return newAppData;
}
