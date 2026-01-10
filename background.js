var window = self;
importScripts("./js-yaml.min.js");
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  const parsedYaml = self.jsyaml.load(message, { json: true });
  sendResponse(parsedYaml);
});
const gitlabUrlFilter = {
  url: [{ hostContains: "gitlab" }],
};

async function injectAnalyzer(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: analyzeIncludesOnPage,
  });
}

// Full page load
chrome.webNavigation.onCompleted.addListener(
  (e) => injectAnalyzer(e.tabId),
  gitlabUrlFilter
);

// SPA navigation (History API - pushState/replaceState)
chrome.webNavigation.onHistoryStateUpdated.addListener(
  (e) => injectAnalyzer(e.tabId),
  gitlabUrlFilter
);

function analyzeIncludesOnPage() {
  const INCLUDE_TYPES = {
    LOCAL: "local",
    REMOTE: "remote",
    TEMPLATE: "template",
    PROJECT: "project",
    COMPONENT: "component",
  };

  const INCLUDE_PATTERNS = {
    [INCLUDE_TYPES.LOCAL]: / - local/,
    [INCLUDE_TYPES.REMOTE]: / - remote/,
    [INCLUDE_TYPES.TEMPLATE]: / - template/,
    [INCLUDE_TYPES.PROJECT]: / - project/,
    [INCLUDE_TYPES.COMPONENT]: / - component/,
  };

  function stripQuotes(str) {
    if (!str) return str;
    const firstChar = str[0];
    if (firstChar === "'" || firstChar === '"') {
      return str.slice(1, -1);
    }
    return str;
  }

  function normalizePath(path) {
    // Remove leading slashes and ensure exactly one
    return "/" + path.replace(/^\/+/, "");
  }

  function getProjectBaseUrl() {
    // URL: https://gitlab.com/group/subgroup/project/-/blob/master/path/file.yml
    // Returns: https://gitlab.com/group/subgroup/project/-/blob/master
    const parts = window.location.href.split("/");
    const blobIndex = parts.indexOf("blob");
    if (blobIndex !== -1) {
      // Include up to ref (branch/tag) - blob index + 2 (blob + ref)
      return parts.slice(0, blobIndex + 2).join("/");
    }
    // Fallback for tree or other views
    const treeIndex = parts.indexOf("tree");
    if (treeIndex !== -1) {
      return parts.slice(0, treeIndex).join("/") + "/-/blob/" + parts[treeIndex + 1];
    }
    return parts.slice(0, 8).join("/");
  }

  function addButtonToElement(lineNumber, url) {
    const linkEl = document.createElement("a");
    linkEl.target = "_blank";
    linkEl.href = url;
    linkEl.className = "gl-shadow-none! file-line-num";

    const lineAnchorEl = document.createElement("a");
    lineAnchorEl.target = "_blank";
    lineAnchorEl.href = `#L${lineNumber}`;
    lineAnchorEl.innerText = lineNumber;
    lineAnchorEl.className = "file-line-num diff-line-num";

    const iconEl = document.createElement("img");
    iconEl.src = chrome.runtime.getURL("/images/green-play-icon.png");
    iconEl.height = 16;
    iconEl.width = 16;
    iconEl.alt = "link to included";

    linkEl.appendChild(iconEl);

    const containerEl = document.createElement("div");
    containerEl.style.cssText = "display: flex; flex-grow: 1";
    containerEl.appendChild(linkEl);
    containerEl.appendChild(lineAnchorEl);

    document.getElementById(`L${lineNumber}`).replaceWith(containerEl);
  }

  function buildIncludeUrl(type, path) {
    const cleanPath = stripQuotes(path);

    if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
      return cleanPath;
    }

    if (type === INCLUDE_TYPES.REMOTE) {
      return cleanPath;
    }

    if (type === INCLUDE_TYPES.TEMPLATE) {
      return `https://gitlab.com/gitlab-org/gitlab/-/blob/master/lib/gitlab/ci/templates/${cleanPath}`;
    }

    if (type === INCLUDE_TYPES.COMPONENT) {
      const [componentPath, version] = cleanPath.split("@");
      const pathParts = componentPath.split("/");
      const host = pathParts[0];
      const componentName = pathParts[pathParts.length - 1];
      const projectPath = pathParts.slice(1, -1).join("/");
      const ref = version || "main";
      return `https://${host}/${projectPath}/-/blob/${ref}/templates/${componentName}.yml`;
    }

    return `${getProjectBaseUrl()}${normalizePath(cleanPath)}`;
  }

  function buildProjectIncludeUrl(project, file, ref) {
    const cleanProject = normalizePath(stripQuotes(project));
    const cleanFile = normalizePath(stripQuotes(file));
    const cleanRef = stripQuotes(ref) || "master";

    return `${window.location.origin}${cleanProject}/-/blob/${cleanRef}${cleanFile}`;
  }

  function detectIncludeType(lineText) {
    for (const [type, pattern] of Object.entries(INCLUDE_PATTERNS)) {
      if (pattern.test(lineText)) {
        return type;
      }
    }
    return null;
  }

  function collectYamlContent() {
    let lineNumber = 1;
    let yamlContent = "";
    const linesByType = {
      [INCLUDE_TYPES.LOCAL]: [],
      [INCLUDE_TYPES.REMOTE]: [],
      [INCLUDE_TYPES.TEMPLATE]: [],
      [INCLUDE_TYPES.PROJECT]: [],
      [INCLUDE_TYPES.COMPONENT]: [],
      simpleString: [],
    };

    while (document.getElementById(`LC${lineNumber}`) !== null) {
      const lineEl = document.getElementById(`LC${lineNumber}`);
      const lineText = lineEl.innerText;

      yamlContent += "\n" + lineText;

      const includeType = detectIncludeType(lineText);
      if (includeType) {
        linesByType[includeType].push(lineNumber);
      } else if (!lineText.includes("include:")) {
        linesByType.simpleString.push(lineNumber);
      }

      lineNumber++;
    }

    return { yamlContent, linesByType };
  }

  function processIncludeItem(include, linesByType) {
    if (typeof include === "string") {
      const lineNumber = linesByType.simpleString.shift();
      if (lineNumber) {
        addButtonToElement(lineNumber, buildIncludeUrl(INCLUDE_TYPES.LOCAL, include));
      }
      return;
    }

    if (typeof include !== "object") return;

    const simpleTypes = [INCLUDE_TYPES.LOCAL, INCLUDE_TYPES.TEMPLATE, INCLUDE_TYPES.REMOTE, INCLUDE_TYPES.COMPONENT];
    
    for (const type of simpleTypes) {
      if (include[type]) {
        const lineNumber = linesByType[type].shift();
        if (lineNumber) {
          addButtonToElement(lineNumber, buildIncludeUrl(type, include[type]));
        }
        return;
      }
    }

    if (include[INCLUDE_TYPES.PROJECT]) {
      const files = Array.isArray(include.file) ? include.file : [include.file];
      const baseLineNumber = linesByType[INCLUDE_TYPES.PROJECT].shift();

      files.forEach((file, index) => {
        const lineOffset = files.length > 1 ? index + 3 : 0;
        addButtonToElement(
          baseLineNumber + lineOffset,
          buildProjectIncludeUrl(include.project, file, include.ref)
        );
      });
    }
  }

  async function process() {
    const { yamlContent, linesByType } = collectYamlContent();
    const parsedYaml = await chrome.runtime.sendMessage(yamlContent);

    if (!parsedYaml?.include?.length) return;

    for (const include of parsedYaml.include) {
      try {
        processIncludeItem(include, linesByType);
      } catch (error) {}
    }
  }

  if (
    window.location.pathname.includes(".yml") ||
    window.location.pathname.includes(".yaml")
  ) {
    const isCodeContentLoaded = setInterval(() => {
      let i = 0;

      if (document.getElementById("LC1") !== null) {
        process();
        clearInterval(isCodeContentLoaded);
      }

      if (i == 10) {
        clearInterval(isCodeContentLoaded);
      }

      i++;
    }, 300);
  }
}
