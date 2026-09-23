/**
 *  ----------------------------------------------------
 *  Zen Browser All Tabs to HTML Bookmarks Converter
 *  ----------------------------------------------------
 */

(function () {
  function getWorkspaceId(el) {
    const id = el.getAttribute("zen-workspace-id");
    return id ? id.replace(/[{}]/g, "") : "default";
  }

  // Function to attempt to get the human-readable workspace name
  function getWorkspaceName(wsId) {
    if (wsId === "default" || !wsId) return "Default Workspace";
    
    // Attempt 1: Try to pull from Zen's internal Workspace Manager if exposed
    if (typeof ZenWorkspaces !== "undefined" && ZenWorkspaces.workspaces) {
      const ws = ZenWorkspaces.workspaces.find(w => w.id.includes(wsId));
      if (ws && ws.name) return ws.name;
    }
    
    // Attempt 2: Try to find the workspace button in the UI DOM and extract its label
    const wsElement = document.querySelector(`toolbarbutton[zen-workspace-id*="${wsId}"]`);
    if (wsElement) {
      return wsElement.getAttribute("label") || wsElement.getAttribute("tooltiptext") || wsId;
    }
    
    // Fallback to ID if name cannot be found
    return wsId;
  }

  const workspaces = new Map(); // key: wsId → { essentials, pinnedOutside, folders: Map, regularTabs }

  /** Scan all individual tabs (Essentials / Pinned / Regular un-foldered tabs) */
  const allTabs = gBrowser.tabContainer.querySelectorAll(".tabbrowser-tab");
  allTabs.forEach((tab) => {
    const wsId = getWorkspaceId(tab);

    const rawUrl =
      tab._originalUrl ||
      (tab.linkedBrowser &&
        tab.linkedBrowser.currentURI &&
        tab.linkedBrowser.currentURI.spec) ||
      null;
    if (!rawUrl || rawUrl === "about:blank") return;

    const isInFolder =
      tab.parentElement &&
      tab.parentElement.classList.contains("tab-group-container");

    if (!workspaces.has(wsId)) {
      workspaces.set(wsId, {
        essentials: [],
        pinnedOutside: [],
        regularTabs: [], // Added array for regular unpinned tabs
        folders: new Map(),
      });
    }
    const ws = workspaces.get(wsId);

    const title =
      tab.getAttribute("label") ||
      (tab.linkedBrowser && tab.linkedBrowser.contentTitle) ||
      rawUrl;

    if (tab.getAttribute("zen-essential") === "true") {
      ws.essentials.push({ title, url: rawUrl });
    } else if (!isInFolder && tab.hasAttribute("pinned")) {
      ws.pinnedOutside.push({ title, url: rawUrl });
    } else if (!isInFolder) {
      // Catch all other tabs not in a folder
      ws.regularTabs.push({ title, url: rawUrl });
    }
  });

  /** Scan all Zen Folder tab groups */
  const allGroups = gBrowser.getAllTabGroups();
  allGroups.forEach((group) => {
    const wsId = getWorkspaceId(group);
    const folderName = group.getAttribute("label") || group.id;

    if (!workspaces.has(wsId)) {
      workspaces.set(wsId, {
        essentials: [],
        pinnedOutside: [],
        regularTabs: [],
        folders: new Map(),
      });
    }
    const ws = workspaces.get(wsId);

    if (!ws.folders.has(folderName)) {
      ws.folders.set(folderName, []);
    }

    const items = group.allItems || [];
    items.forEach((item) => {
      if (item.tagName.toLowerCase() !== "tab") return;

      const rawUrl =
        item._originalUrl ||
        (item.linkedBrowser &&
          item.linkedBrowser.currentURI &&
          item.linkedBrowser.currentURI.spec) ||
        null;
      if (!rawUrl || rawUrl === "about:blank") return;

      const title =
        item.getAttribute("label") ||
        (item.linkedBrowser && item.linkedBrowser.contentTitle) ||
        rawUrl;

      ws.folders.get(folderName).push({ title, url: rawUrl });
    });
  });

  /** Generate a bookmark file for each workspace */
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  workspaces.forEach((wsData, wsId) => {
    const wsName = getWorkspaceName(wsId);
    
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Zen Browser Bookmarks – Workspace: ${wsName}</TITLE>
<H1>Zen Browser Bookmarks – Workspace: ${wsName}</H1>
<DL><p>
`;

    if (wsData.essentials.length) {
      html += `  <DT><H3>Essentials</H3>\n`;
      html += `  <DL><p>\n`;
      wsData.essentials.forEach(({ title, url }) => {
        const safeTitle = title.replace(/"/g, "&quot;");
        const safeUrl = url.replace(/"/g, "&quot;");
        html += `    <DT><A HREF="${safeUrl}">${safeTitle}</A>\n`;
      });
      html += `  </DL><p>\n`;
    }

    if (wsData.pinnedOutside.length) {
      html += `  <DT><H3>Pinned Tabs</H3>\n`;
      html += `  <DL><p>\n`;
      wsData.pinnedOutside.forEach(({ title, url }) => {
        const safeTitle = title.replace(/"/g, "&quot;");
        const safeUrl = url.replace(/"/g, "&quot;");
        html += `    <DT><A HREF="${safeUrl}">${safeTitle}</A>\n`;
      });
      html += `  </DL><p>\n`;
    }
    
    // Added section for standard tabs
    if (wsData.regularTabs.length) {
      html += `  <DT><H3>Other Tabs</H3>\n`;
      html += `  <DL><p>\n`;
      wsData.regularTabs.forEach(({ title, url }) => {
        const safeTitle = title.replace(/"/g, "&quot;");
        const safeUrl = url.replace(/"/g, "&quot;");
        html += `    <DT><A HREF="${safeUrl}">${safeTitle}</A>\n`;
      });
      html += `  </DL><p>\n`;
    }

    wsData.folders.forEach((items, folderName) => {
      html += `  <DT><H3>${folderName}</H3>\n`;
      html += `  <DL><p>\n`;
      items.forEach(({ title, url }) => {
        const safeTitle = title.replace(/"/g, "&quot;");
        const safeUrl = url.replace(/"/g, "&quot;");
        html += `    <DT><A HREF="${safeUrl}">${safeTitle}</A>\n`;
      });
      html += `  </DL><p>\n`;
    });

    html += `</DL><p>\n`;

    /** Download the bookmark file for each workspace */
    const blob = new Blob([html], { type: "text/html" });
    const objectURL = URL.createObjectURL(blob);
    const a = document.createElement("a");

    // Clean up the workspace name so it's safe for a filename
    const safeFilenameName = wsName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    a.href = objectURL;
    a.download = `zen-bookmarks-${safeFilenameName}-${yyyy}${mm}${dd}.html`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectURL);
  });

  console.log(`Exported ${workspaces.size} workspace(s).`);
})();
