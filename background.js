var window = self;
importScripts("./js-yaml.min.js");
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  const parsedYaml = self.jsyaml.load(message, { json: true });
  sendResponse(parsedYaml);
});
chrome.webNavigation.onCompleted.addListener(
  async function (e) {
    chrome.scripting.executeScript({
      target: {
        tabId: e.tabId,
      },
      func: analyzeIncludesOnPage,
    });
  },
  {
    url: [
      {
        hostContains: "gitlab",
      },
    ],
  }
);

function analyzeIncludesOnPage() {
  function addButtonToElement(index, url) {
    const aEl = document.createElement("a");
    aEl.setAttribute("target", "_blank");
    aEl.setAttribute("href", url);
    aEl.classList = "gl-shadow-none! file-line-num";

    const aElForLineId = document.createElement("a");
    aElForLineId.setAttribute("target", "_blank");
    aElForLineId.setAttribute("href", `#L${index}`);
    aElForLineId.innerText = index;
    aElForLineId.classList = "file-line-num diff-line-num";

    let imageEl = document.createElement("img");
    imageEl.setAttribute(
      "src",
      chrome.runtime.getURL("/images/green-play-icon.png")
    );

    imageEl.setAttribute("height", "16");
    imageEl.setAttribute("width", "16");
    imageEl.setAttribute("alt", "link to included");

    aEl.appendChild(imageEl);

    const divEl = document.createElement("div");
    divEl.style = "display: flex; flex-grow: 1";
    divEl.appendChild(aEl);
    divEl.appendChild(aElForLineId);

    document.getElementById(`L${index}`).replaceWith(divEl);
  }

  function addSlashToURL(url) {
    if (url[0] !== "/") {
      return "/" + url;
    }
    return url;
  }

  function removeTick(url) {
    if (url[0] === "'") {
      return url.slice(1, -1);
    }
    return url;
  }

  function removeDoubleTick(url) {
    if (url[0] === '"') {
      return url.slice(1, -1);
    }
    return url;
  }

  function createIncludedLink(type, url) {
    if (url.includes("http://") || url.includes("https://")) {
      return url;
    }

    url = removeTick(url);
    url = removeDoubleTick(url);

    const hostWithProjectName = window.location.href
      .split("/")
      .slice(0, 8)
      .join("/");
    const urlWithSlash = addSlashToURL(url);

    switch (type) {
      case "local":
        return `${hostWithProjectName}${urlWithSlash}`;
      case "remote":
        return url;
      case "template":
        return `${hostWithProjectName}${urlWithSlash}`;
    }
  }

  function createProjectIncludedLink(project, file, ref) {
    if (project) {
      project = removeTick(project);
      project = removeDoubleTick(project);
      project = addSlashToURL(project);
    }

    if (file) {
      file = removeTick(file);
      file = removeDoubleTick(file);
      file = addSlashToURL(file);
    }

    if (ref) {
      ref = removeTick(ref);
      ref = removeDoubleTick(ref);
    }

    const host = window.location.origin;

    return `${host}${project}/-/blob/${ref || "master"}${file}`;
  }

  async function process() {
    let i = 1;
    let yamlContent = "";
    const arrayOfProperties = {
      local: [],
      remote: [],
      template: [],
      project: [],
      simpleString: [],
    };
    while (document.getElementById(`LC${i}`) !== null) {
      const line = document.getElementById(`LC${i}`);
      try {
        yamlContent += "\n" + line.innerText;
        if (line.innerText.includes(" - local")) {
          arrayOfProperties["local"].push(i);
        } else if (line.innerText.includes(" - remote")) {
          arrayOfProperties["remote"].push(i);
        } else if (line.innerText.includes(" - template")) {
          arrayOfProperties["template"].push(i);
        } else if (line.innerText.includes(" - project")) {
          arrayOfProperties["project"].push(i);
        } else if (!line.innerText.includes("include:")) {
          arrayOfProperties.simpleString.push(i);
        }
      } catch (error) {}

      i++;
    }

    const parsedYaml = await chrome.runtime.sendMessage(yamlContent);

    if (parsedYaml.include.length > 0) {
      for (const property of parsedYaml.include) {
        try {
          if (typeof property === "string") {
            addButtonToElement(
              arrayOfProperties.simpleString[0],
              createIncludedLink("local", property)
            );
            arrayOfProperties.simpleString.shift();
          } else if (typeof property === "object") {
            if (property["local"]) {
              addButtonToElement(
                arrayOfProperties.local[0],
                createIncludedLink("template", property["local"])
              );
              arrayOfProperties.local.shift();
            } else if (property["template"]) {
              addButtonToElement(
                arrayOfProperties.template[0],

                createIncludedLink("template", property["template"])
              );
              arrayOfProperties.template.shift();
            } else if (property["remote"]) {
              addButtonToElement(
                arrayOfProperties.remote[0],
                createIncludedLink("remote", property["remote"])
              );
              arrayOfProperties.remote.shift();
            } else if (property["project"]) {
              if (Array.isArray(property["file"])) {
                for (let index = 0; index < property["file"].length; index++) {
                  addButtonToElement(
                    arrayOfProperties.project[0] + index + 3,
                    createProjectIncludedLink(
                      property["project"],
                      property["file"][index],
                      property["ref"]
                    )
                  );
                }
              } else {
                addButtonToElement(
                  arrayOfProperties.project[0],
                  createProjectIncludedLink(
                    property["project"],
                    property["file"],
                    property["ref"]
                  )
                );
              }
              arrayOfProperties.project.shift();
            }
          }
        } catch (error) {}
      }
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
