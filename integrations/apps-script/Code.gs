/**
 * Paste the generated Code.gs and manifest into a standalone Apps Script project.
 * Run install once and approve the three scopes. No web app deployment is needed.
 * The Drive advanced-service manifest enables Drive API in the default Cloud
 * project. For a standard Cloud project, enable Drive API in Cloud Console too:
 * https://developers.google.com/apps-script/guides/services/advanced
 * Never log a fetch response, document content, or either service credential.
 */
var DRIVE_AGENT_CONFIG = /*__DRIVE_AGENT_CONFIG__*/null;
var DRIVE_FIELDS = "id,name,mimeType,version,modifiedTime,size,resourceKey,shortcutDetails(targetId,targetMimeType,targetResourceKey)";
var DRIVE_FOLDER = "application/vnd.google-apps.folder";
var DRIVE_SHORTCUT = "application/vnd.google-apps.shortcut";
var DRIVE_MAX_BYTES = 20971520;
var DRIVE_PLATFORM_MS = 360000;
var DRIVE_RUN = null;

function install() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var properties = PropertiesService.getScriptProperties();
    if (!properties.getProperty("connectorToken")) {
      var pair = driveApi("pair", { code: DRIVE_AGENT_CONFIG.pairingCode }, true);
      if (!driveString(pair.token) || !driveString(pair.connectionId)) throw driveError("Invalid pairing response", true);
      properties.setProperty("connectorToken", pair.token);
      properties.setProperty("connectionId", pair.connectionId);
    }
    var found = false;
    ScriptApp.getProjectTriggers().forEach(function(trigger) {
      if (trigger.getHandlerFunction() === "syncDrive") {
        if (found) ScriptApp.deleteTrigger(trigger);
        found = true;
      }
    });
    if (!found) ScriptApp.newTrigger("syncDrive").timeBased().everyDays(1).atHour(3).create();
  } finally { lock.releaseLock(); }
  syncDrive();
}

function syncDrive() { driveRun(); }
function resumeDrive() { driveRun(); }

function uninstallTriggers() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try { driveRemoveTriggers("syncDrive"); driveRemoveTriggers("resumeDrive"); }
  finally { lock.releaseLock(); }
}

function driveRemoveTriggers(handler) {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handler) ScriptApp.deleteTrigger(trigger);
  });
}

function driveContinue() {
  driveRemoveTriggers("resumeDrive");
  var properties = PropertiesService.getScriptProperties();
  var day = new Date(Date.now()).toISOString().slice(0, 10);
  var used = properties.getProperty("runtimeDay") === day ? Number(properties.getProperty("runtimeMs") || 0) : 0;
  if (used >= 0 && used + DRIVE_PLATFORM_MS <= 1800000) {
    ScriptApp.newTrigger("resumeDrive").timeBased().after(60000).create();
  }
}

function driveRun() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  var properties = PropertiesService.getScriptProperties();
  var start = Date.now(), day = new Date(start).toISOString().slice(0, 10);
  var used = properties.getProperty("runtimeDay") === day ? Number(properties.getProperty("runtimeMs") || 0) : 0;
  if (!isFinite(used) || used < 0) used = 1800000;
  var dayRemaining = Date.parse(day + "T00:00:00.000Z") + 86400000 - start;
  var allowance = 240000;
  var pending = false, failure = null;
  try {
    driveRemoveTriggers("resumeDrive");
    if (used + DRIVE_PLATFORM_MS > 1800000) return;
    // A blocking UrlFetch can run beyond our cooperative work deadline. Do not
    // start unless its entire platform lifetime fits this UTC day's allowance.
    if (dayRemaining <= DRIVE_PLATFORM_MS) { pending = true; return; }
    if (!properties.getProperty("connectorToken")) throw driveError("Run install before syncing", false);
    properties.setProperty("runtimeDay", day);
    // The platform can terminate a six-minute invocation without executing
    // finally. Reserve that worst case, not just the four-minute work deadline.
    properties.setProperty("runtimeMs", String(used + DRIVE_PLATFORM_MS));
    DRIVE_RUN = { deadline: start + allowance, scanId: null, checkpoint: null };
    pending = true;
    var session = driveApi("session", {});
    if (!driveString(session.scanId) || !Array.isArray(session.mappings) || (session.checkpoint !== null && session.checkpoint !== undefined && (!session.checkpoint.roots || typeof session.checkpoint.roots !== "object"))) {
      throw driveError("Invalid session response", true);
    }
    DRIVE_RUN.scanId = session.scanId;
    DRIVE_RUN.checkpoint = session.checkpoint || { roots: {} };
    session.mappings.forEach(function(mapping) {
      if (!driveString(mapping.id) || !driveString(mapping.driveFolderId) || !driveString(mapping.rootCourseTitle) || ["course", "collection"].indexOf(mapping.mode) < 0) throw driveError("Invalid folder mapping", true);
      if (!Object.prototype.hasOwnProperty.call(DRIVE_RUN.checkpoint.roots, mapping.id)) {
        DRIVE_RUN.checkpoint.roots[mapping.id] = { pendingFolders: [{ id: mapping.driveFolderId, courseFolderId: mapping.driveFolderId, courseFolderTitle: mapping.rootCourseTitle }], visitedFolderIds: [], completed: false, failed: false };
      }
    });
    driveCheckpoint();
    for (var index = 0; index < session.mappings.length && driveHasTime(); index++) {
      var mapping = session.mappings[index];
      var root = DRIVE_RUN.checkpoint.roots[mapping.id];
      if (!Array.isArray(root.pendingFolders) || !Array.isArray(root.visitedFolderIds)) throw driveError("Invalid checkpoint response", true);
      while (!root.completed && root.pendingFolders.length && driveHasTime()) {
        if (root.nextPageToken === undefined) driveLoadPage(mapping, root);
        if (root.pendingFiles && root.pendingFiles.length) driveProcessFiles(root);
        if (root.pendingFiles && root.pendingFiles.length) {
          if (driveHasTime()) continue;
          break;
        }
        // nextPageToken is present (including the empty final-page sentinel)
        // only after the page and every file have been acknowledged server-side.
        if (root.nextPageToken !== undefined) {
          var current = root.pendingFolders[0];
          if (root.nextPageToken) current.pageToken = root.nextPageToken;
          else { root.visitedFolderIds.push(current.id); root.pendingFolders.shift(); }
          delete root.nextPageToken;
          delete root.pendingFiles;
          if (!root.pendingFolders.length) root.completed = !root.failed;
          driveCheckpoint();
        }
      }
    }
    pending = session.mappings.some(function(mapping) { return DRIVE_RUN.checkpoint.roots[mapping.id].pendingFolders.length > 0; });
  } catch (error) {
    // Deliberately omit external error text: it may contain signed URLs or data.
    failure = driveError(error && error.message === "Checkpoint capacity exceeded; previous state preserved" ? error.message : "Drive sync paused; saved progress will be retried", true);
  } finally {
    if (DRIVE_RUN) {
      if (!failure) properties.setProperty("runtimeMs", String(Math.min(1800000, used + Math.max(0, Date.now() - start))));
      DRIVE_RUN = null;
    }
    try { if (pending) driveContinue(); } finally { lock.releaseLock(); }
  }
  if (failure) throw failure;
}

function driveHasTime() { return !DRIVE_RUN || Date.now() + 15000 < DRIVE_RUN.deadline; }
function driveString(value) { return typeof value === "string" && value.length > 0; }
function driveError(message, retryable) { var error = new Error(message); error.retryable = retryable; return error; }

function driveCheckpoint(errors) {
  var checkpoint = DRIVE_RUN.checkpoint;
  if (Utilities.newBlob(JSON.stringify(checkpoint)).getBytes().length > 262144) throw driveError("Checkpoint capacity exceeded; previous state preserved", true);
  var completed = Object.keys(checkpoint.roots).filter(function(id) { return checkpoint.roots[id].completed && !checkpoint.roots[id].failed; });
  var payload = { scanId: DRIVE_RUN.scanId, checkpoint: checkpoint, completedRootIds: completed };
  if (errors && errors.length) payload.errors = errors;
  var result;
  try { result = driveApi("checkpoint", payload); }
  catch (error) {
    if (error.httpStatus === 413) throw driveError("Checkpoint capacity exceeded; previous state preserved", true);
    throw error;
  }
  if (result.ok !== true) throw driveError("Invalid checkpoint acknowledgment", true);
}

function driveLoadPage(mapping, root) {
  var current = root.pendingFolders[0], page;
  try {
    var query = { q: "'" + current.id.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "' in parents and trashed = false", fields: "nextPageToken,incompleteSearch,files(" + DRIVE_FIELDS + ")", pageSize: 100, supportsAllDrives: true, includeItemsFromAllDrives: true };
    if (current.pageToken) query.pageToken = current.pageToken;
    page = driveGoogleJson("files", query, current.id, current.resourceKey);
    if (!Array.isArray(page.files) || (page.nextPageToken !== undefined && typeof page.nextPageToken !== "string")) throw driveError("Invalid Drive listing", true);
    if (page.incompleteSearch) throw driveError("Drive search incomplete", false);
  } catch (error) {
    if (error.retryable) throw error;
    root.failed = true; root.pendingFolders.shift();
    driveCheckpoint([{ driveFileId: current.id, message: "Folder could not be fully listed" }]);
    return;
  }
  var files = [], errors = [];
  page.files.forEach(function(entry) {
    var file;
    try { file = driveResolve(entry); }
    catch (error) {
      if (error.retryable) throw error;
      root.failed = true;
      errors.push({ driveFileId: entry.id, message: "Shortcut or file could not be read" });
      return;
    }
    if (file.mimeType === DRIVE_FOLDER) {
      if (root.visitedFolderIds.indexOf(file.id) >= 0 || root.pendingFolders.some(function(folder) { return folder.id === file.id; })) return;
      var topCourse = mapping.mode === "collection" && current.id === mapping.driveFolderId;
      var next = { id: file.id, courseFolderId: topCourse ? file.id : current.courseFolderId, courseFolderTitle: topCourse ? file.name : current.courseFolderTitle };
      if (file.resourceKey) next.resourceKey = file.resourceKey;
      root.pendingFolders.push(next);
      return;
    }
    if (!driveString(file.version) && !driveString(file.modifiedTime)) throw driveError("Missing Drive version metadata", true);
    var source = { driveFileId: file.id, name: file.name, mimeType: file.mimeType, parentId: current.id, sourceUrl: "https://drive.google.com/file/d/" + encodeURIComponent(file.id) + "/view" + (file.resourceKey ? "?resourcekey=" + encodeURIComponent(file.resourceKey) : ""), fingerprint: JSON.stringify([file.version || "", file.modifiedTime || ""]), folderMappingId: mapping.id, courseFolderId: current.courseFolderId, courseFolderTitle: current.courseFolderTitle };
    if (entry.mimeType === DRIVE_SHORTCUT) source.targetId = file.id;
    if (file.size !== undefined && isFinite(Number(file.size))) source.size = Number(file.size);
    if (!files.some(function(existing) { return existing.driveFileId === source.driveFileId; })) files.push(source);
  });
  root.pendingFiles = files;
  root.nextPageToken = page.nextPageToken || "";
  driveCheckpoint(errors);
}

function driveResolve(entry) {
  var seen = [], file = entry;
  while (true) {
    if (!file || !driveString(file.id) || !driveString(file.name) || !driveString(file.mimeType)) throw driveError("Invalid Drive metadata", true);
    if (file.mimeType !== DRIVE_SHORTCUT) return file;
    if (seen.indexOf(file.id) >= 0 || seen.length >= 32 || !file.shortcutDetails || !driveString(file.shortcutDetails.targetId)) throw driveError("Shortcut cycle or missing target", false);
    seen.push(file.id);
    var target = file.shortcutDetails.targetId, key = file.shortcutDetails.targetResourceKey;
    file = driveGoogleJson("files/" + encodeURIComponent(target), { fields: DRIVE_FIELDS, supportsAllDrives: true }, target, key);
    if (key && !file.resourceKey) file.resourceKey = key;
  }
}

function driveProcessFiles(root) {
  var batch = root.pendingFiles.slice(0, 100);
  var result = driveApi("inventory", { scanId: DRIVE_RUN.scanId, files: batch });
  if (!Array.isArray(result.decisions) || result.decisions.length !== batch.length) throw driveError("Invalid inventory response", true);
  var decisions = {};
  result.decisions.forEach(function(decision) {
    if (!decision || !driveString(decision.driveFileId) || Object.prototype.hasOwnProperty.call(decisions, decision.driveFileId) || ["unchanged", "upload", "unsupported", "conflict", "retry_later"].indexOf(decision.action) < 0 || (decision.action === "upload" && !driveString(decision.itemId))) throw driveError("Invalid inventory decision", true);
    decisions[decision.driveFileId] = decision;
  });
  if (batch.some(function(file) { return !Object.prototype.hasOwnProperty.call(decisions, file.driveFileId); })) throw driveError("Missing inventory decision", true);
  for (var i = 0; i < batch.length && driveHasTime(); i++) {
    var file = batch[i], decision = decisions[file.driveFileId], errors = [];
    if (decision.action === "retry_later") throw driveError("File is busy; retry later", true);
    if (decision.action === "upload") {
      try { driveTransfer(file, decision.itemId); }
      catch (error) {
        if (error.retryable) throw error;
        errors.push({ driveFileId: file.driveFileId, itemId: decision.itemId, message: error.fileSize ? "File exceeds the 20 MiB import limit" : "File transfer failed; review connector errors" });
      }
    }
    root.pendingFiles.shift();
    driveCheckpoint(errors);
  }
}

function driveTransfer(file, itemId) {
  if (typeof file.size === "number" && file.size > DRIVE_MAX_BYTES) throw driveSizeError();
  var destination = driveApi("upload", { itemId: itemId });
  if (destination.storageOrigin !== DRIVE_AGENT_CONFIG.storageOrigin || !driveStorageUrl(destination.signedUrl)) throw driveError("Unsafe upload destination", false);
  var contentType = file.mimeType, parameters = {}, suffix = "files/" + encodeURIComponent(file.driveFileId);
  if (contentType === "application/vnd.google-apps.document") { contentType = "application/pdf"; suffix += "/export"; parameters.mimeType = contentType; }
  else if (contentType === "application/vnd.google-apps.presentation") { contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation"; suffix += "/export"; parameters.mimeType = contentType; }
  else { parameters.alt = "media"; parameters.supportsAllDrives = true; }
  var keyMatch = /[?&]resourcekey=([^&#]*)/.exec(file.sourceUrl), key = keyMatch ? decodeURIComponent(keyMatch[1]) : undefined;
  var download = driveGoogle(suffix, parameters, file.driveFileId, key);
  // Byte[] is sent directly as the request body, never base64 or JSON.
  var bytes = download.getBlob().getBytes();
  if (bytes.length > DRIVE_MAX_BYTES) throw driveSizeError();
  driveFetch(destination.signedUrl, { method: "put", contentType: contentType, payload: bytes }, true);
  var final = driveApi("finalize", { itemId: itemId });
  if (!driveString(final.materialId) || typeof final.version !== "number" || !driveString(final.status)) throw driveError("Invalid finalize response", true);
}

function driveSizeError() {
  var error = driveError("File exceeds the 20 MiB import limit", false);
  error.fileSize = true;
  return error;
}

function driveStorageUrl(value) {
  // Apps Script V8 has no browser URL API. Match the complete authority first;
  // requiring a slash after it rejects userinfo, ports, suffix hosts and escapes.
  return typeof value === "string" && value.indexOf(DRIVE_AGENT_CONFIG.storageOrigin + "/") === 0 && !/[\\\s\u0000-\u001f\u007f]/.test(value) && value.indexOf("#") < 0;
}

function driveApi(endpoint, body, pairing) {
  var headers = {};
  if (!pairing) headers.Authorization = "Bearer " + PropertiesService.getScriptProperties().getProperty("connectorToken");
  return driveJson(driveFetch(DRIVE_AGENT_CONFIG.baseUrl + "/api/drive-agent/" + endpoint, { method: "post", contentType: "application/json", payload: JSON.stringify(body), headers: headers }, false, endpoint === "checkpoint"));
}

function driveGoogleJson(path, parameters, id, key) { return driveJson(driveGoogle(path, parameters, id, key)); }
function driveGoogle(path, parameters, id, key) {
  var query = Object.keys(parameters).map(function(name) { return encodeURIComponent(name) + "=" + encodeURIComponent(String(parameters[name])); }).join("&");
  var headers = { Authorization: "Bearer " + ScriptApp.getOAuthToken() };
  if (key) headers["X-Goog-Drive-Resource-Keys"] = id + "/" + key;
  return driveFetch("https://www.googleapis.com/drive/v3/" + path + "?" + query, { method: "get", headers: headers });
}

function driveJson(response) {
  var value;
  try { value = JSON.parse(response.getContentText()); }
  catch (_) { throw driveError("Invalid JSON response", true); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw driveError("Invalid JSON object", true);
  return value;
}

function driveFetch(url, options, acceptConflict, checkpointWrite) {
  options.followRedirects = false;
  options.muteHttpExceptions = true;
  for (var attempt = 0; attempt <= 3; attempt++) {
    if (DRIVE_RUN && Date.now() + (checkpointWrite ? 1000 : 15000) >= DRIVE_RUN.deadline) throw driveError("Execution budget reached", true);
    var response, status = 0, transient = true;
    try { response = UrlFetchApp.fetch(url, options); status = response.getResponseCode(); }
    catch (fetchError) {
      // These deterministic request/response failures cannot succeed on retry.
      // Inspect only their category; never retain external text or signed URLs.
      var message = fetchError && typeof fetchError.message === "string" ? fetchError.message : "";
      if (/URL Fetch (?:response|request|POST) size|(?:response|request|argument) too large|response size.*exceed/i.test(message)) throw driveSizeError();
      if (/invalid (?:argument|url|header)|malformed (?:url|header)|unsupported (?:protocol|content type)/i.test(message)) throw driveError("Invalid network request", false);
      // Unknown transport failures stay retryable, with sanitized status zero.
    }
    if (status >= 200 && status < 300 || acceptConflict && status === 409) return response;
    transient = status === 0 || status === 408 || status === 429 || status >= 500;
    if (status === 403 && response) transient = /rateLimitExceeded|userRateLimitExceeded/.test(response.getContentText());
    if (!transient || attempt === 3) {
      var error = driveError("Request failed (HTTP " + status + ")", transient);
      error.httpStatus = status;
      throw error;
    }
    var delay = Math.min(30000, 1000 * Math.pow(2, attempt));
    if (response) {
      var headers = response.getAllHeaders();
      Object.keys(headers).forEach(function(name) {
        if (name.toLowerCase() !== "retry-after") return;
        var seconds = Number(headers[name]), until = isFinite(seconds) ? seconds * 1000 : Date.parse(headers[name]) - Date.now();
        if (isFinite(until)) delay = Math.max(delay, until);
      });
    }
    if (DRIVE_RUN && Date.now() + delay + 15000 >= DRIVE_RUN.deadline) throw driveError("Retry exceeds execution budget", true);
    Utilities.sleep(delay);
  }
}
