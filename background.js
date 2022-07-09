chrome.webNavigation.onCompleted.addListener(
  async (e) => {
    chrome.scripting.executeScript({
      target: {
        tabId: e.tabId,
      },
      function: analyzeIncludesOnPage,
    });
  },
  {
    url: [
      {
        hostSuffix: "gitlab.com",
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

  function createIncludedLink(type, url) {
    url = removeTick(url);

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
    project = removeTick(project);
    project = addSlashToURL(project);
    file = removeTick(file);
    file = addSlashToURL(file);

    ref = removeTick(ref);
    const host = window.location.origin;

    return `${host}${project}/-/blob/${ref}${file}`;
  }

  function getLineAttr(id) {
    return document.querySelector(`[id=LC${id}] > .hljs-attr`);
  }

  function getLineValue(id) {
    return document.querySelector(`[id=LC${id}] > .hljs-string`);
  }

  function getLine(id) {
    return document.querySelector(`[id=LC${id}]`);
  }

  function process() {
    let i = 1;
    while (document.getElementById(`LC${i}`) !== null) {
      const line = document.getElementById(`LC${i}`);
      try {
        if (
          line.textContent !== null &&
          line.textContent.startsWith("include:") &&
          line.textContent.endsWith("include:") !== true
        ) {
          addButtonToElement(
            i,
            createIncludedLink("local", getLineValue(i).textContent)
          );
        }

        if (
          !getLine(i).textContent.includes("file:") &&
          getLineValue(i).textContent.startsWith("'https://")
        ) {
          addButtonToElement(
            i,
            createIncludedLink("remote", getLineValue(i).textContent)
          );
        } else if (
          !getLine(i).textContent.includes("file:") &&
          (getLineValue(i).textContent.startsWith("'/") ||
            getLineValue(i).textContent.startsWith("/"))
        ) {
          addButtonToElement(
            i,
            createIncludedLink("local", getLineValue(i).textContent)
          );
        } else if (getLineAttr(i).textContent == "local:") {
          addButtonToElement(
            i,
            createIncludedLink("local", getLineValue(i).textContent)
          );
        } else if (getLineAttr(i).textContent == "remote:") {
          addButtonToElement(
            i,
            createIncludedLink("remote", getLineValue(i).textContent)
          );
        } else if (getLineAttr(i).textContent == "template:") {
          addButtonToElement(
            i,
            createIncludedLink("template", getLineValue(i).textContent)
          );
        } else if (getLineAttr(i).textContent == "project:") {
          let refValue = "";
          let fileValue = "";
          if (getLineAttr(i + 1).textContent == "ref:") {
            refValue = getLineValue(i + 1).textContent;
          }
          try {
            if (getLineAttr(i + 2).textContent == "ref:") {
              refValue = getLineValue(i + 2).textContent;
            }
          } catch (error) {
            refValue = "master";
          }
          if (getLineAttr(i + 1).textContent == "file:") {
            fileValue = getLineValue(i + 1).textContent;
          }
          try {
            if (getLineAttr(i + 2).textContent == "file:") {
              fileValue = getLineValue(i + 2).textContent;
            }
          } catch (error) {}

          addButtonToElement(
            i,
            createProjectIncludedLink(
              getLineValue(i).textContent,
              fileValue,
              refValue
            )
          );
        }
      } catch (error) {
        console.log(error.message);
      }
      i++;
    }
  }

  const isCodeContentLoaded = setInterval(() => {
    if (document.getElementById("LC1") !== null) {
      process();
      clearInterval(isCodeContentLoaded)
    }
  }, 300);
}
