var window = self;
importScripts("./js-yaml.min.js");
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  const parsedYaml = self.jsyaml.load(message);
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
    aEl.style = "margin-right: 8px";

    let imageEl = document.createElement("img");
    imageEl.setAttribute(
      "src",
      chrome.runtime.getURL("/images/green-play-icon.png")
    );

    imageEl.setAttribute("height", "16");
    imageEl.setAttribute("width", "16");
    imageEl.setAttribute("alt", "link to included");

    aEl.appendChild(imageEl);

    document.getElementById(`L${index}`).before(aEl);
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

  function findLineNumber(value) {
    let i = 1;
    while (document.getElementById(`LC${i}`) !== null) {
      const line = document.getElementById(`LC${i}`);
      try {
        if (line.innerText.includes(value)) {
          return i;
        }
      } catch (error) {}

      i++;
    }
  }

  async function process() {
    let i = 1;
    let yamlContent = "";
    const arraySira = {
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
          arraySira["local"].push(i);
        } else if (line.innerText.includes(" - remote")) {
          arraySira["remote"].push(i);
        } else if (line.innerText.includes(" - template")) {
          arraySira["template"].push(i);
        } else if (line.innerText.includes(" - project")) {
          arraySira["project"].push(i);
        } else if (!line.innerText.includes("include:")) {
          arraySira.simpleString.push(i);
        }
        console.log(arraySira);
      } catch (error) {}

      i++;
    }
    const parsedYaml = await chrome.runtime.sendMessage(yamlContent);

    if (parsedYaml.include.length > 0) {
      for (const property of parsedYaml.include) {
        try {
          if (typeof property === "string") {
            addButtonToElement(
              arraySira.simpleString[0],
              createIncludedLink("local", property)
            );
            arraySira.simpleString.shift();
          } else if (typeof property === "object") {
            if (property["local"]) {
              addButtonToElement(
                arraySira.local[0],
                createIncludedLink("template", property["local"])
              );
              arraySira.local.shift();
            } else if (property["template"]) {
              addButtonToElement(
                arraySira.template[0],

                createIncludedLink("template", property["template"])
              );
              arraySira.template.shift();
            } else if (property["remote"]) {
              addButtonToElement(
                arraySira.remote[0],
                createIncludedLink("remote", property["remote"])
              );
              arraySira.remote.shift();
            } else if (property["project"]) {
              if (Array.isArray(property["file"])) {
                for (const iterator of property["file"]) {
                  addButtonToElement(
                    arraySira.project[0],
                    createProjectIncludedLink(
                      property["project"],
                      iterator,
                      property["ref"]
                    )
                  );
                }
              } else {
                addButtonToElement(
                  arraySira.project[0],
                  createProjectIncludedLink(
                    property["project"],
                    property["file"],
                    property["ref"]
                  )
                );
              }
              arraySira.project.shift();
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
