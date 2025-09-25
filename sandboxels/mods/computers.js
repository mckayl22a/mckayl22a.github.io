// computers.js – Lua Computer Mod for Sandboxels

let mouseIsDown = false;
document.addEventListener("mousedown", () => mouseIsDown = true);
document.addEventListener("mouseup",   () => mouseIsDown = false);

runAfterLoad(function() {
    // --- Utility: Create editor GUI ---
    function openLuaEditor(pixel) {
        if (!pixel) return;

        // Prevent multiple editors
        if (document.getElementById("luaEditorOverlay")) return;

        // Create overlay
        const overlay = document.createElement("div");
        overlay.id = "luaEditorOverlay";
        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(0,0,0,0.6)";
        overlay.style.display = "flex";
        overlay.style.alignItems = "center";
        overlay.style.justifyContent = "center";
        overlay.style.zIndex = "9999";

        // Editor box
        const box = document.createElement("div");
        box.style.background = "#222";
        box.style.padding = "20px";
        box.style.borderRadius = "10px";
        box.style.width = "600px";
        box.style.maxWidth = "90%";
        box.style.display = "flex";
        box.style.flexDirection = "column";
        box.style.gap = "10px";
        overlay.appendChild(box);

        // Title
        const title = document.createElement("h2");
        title.innerText = "Edit Lua Code";
        title.style.color = "#fff";
        title.style.margin = "0";
        box.appendChild(title);

        // Textarea
        const textarea = document.createElement("textarea");
        textarea.value = pixel.code || ""; // ✅ Empty if no code
        textarea.style.width = "100%";
        textarea.style.height = "300px";
        textarea.style.fontFamily = "monospace";
        textarea.style.fontSize = "14px";
        textarea.style.background = "#111";
        textarea.style.color = "#0f0";
        textarea.style.border = "1px solid #555";
        textarea.style.borderRadius = "5px";
        textarea.style.padding = "10px";
        box.appendChild(textarea);

        // Buttons container
        const buttons = document.createElement("div");
        buttons.style.display = "flex";
        buttons.style.justifyContent = "flex-end";
        buttons.style.gap = "10px";
        box.appendChild(buttons);

        // Cancel button
        const cancelBtn = document.createElement("button");
        cancelBtn.innerText = "Cancel";
        cancelBtn.style.padding = "5px 15px";
        cancelBtn.onclick = () => {
            overlay.remove();
        };
        buttons.appendChild(cancelBtn);

        // Save button
        const saveBtn = document.createElement("button");
        saveBtn.innerText = "Save";
        saveBtn.style.padding = "5px 15px";
        saveBtn.onclick = () => {
            pixel.code = textarea.value;
            pixel.running = false; // reset execution
            overlay.remove();
        };
        buttons.appendChild(saveBtn);

        // Add overlay to body
        document.body.appendChild(overlay);
    }

    // --- Lua Computer Element ---
    elements.luacomputer = {
        name: "Lua Computer",
        color: "#3333BB",
        behavior: behaviors.WALL,
        category: "computers",
        state: "solid",
        conduct: 1,
        properties: {
            code: "", // ✅ starts empty
            output: "",
            running: false,
            networkId: null
        },
        desc: "A programmable Lua computer. Use the Edit tool to change its code.",

        tick: function(pixel) {
            if (pixel.running) return;
            if (!pixel.code || pixel.code.trim() === "") return; // ✅ Skip if no code

            if (typeof fengari === "undefined") {
                pixel.output = "Fengari not loaded!";
                pixel.running = true;
                return;
            }

            try {
                const luaCode = pixel.code || "";
                const L = fengari.L,
                      lua = fengari.lua,
                      lauxlib = fengari.lauxlib,
                      lualib = fengari.lualib,
                      to_luastring = fengari.to_luastring;

                const luaState = lauxlib.luaL_newstate();
                lualib.luaL_openlibs(luaState);

                const status = lauxlib.luaL_loadstring(luaState, to_luastring(luaCode));
                if (status !== lua.LUA_OK) {
                    pixel.output = "Lua syntax error: " + lua.lua_tojsstring(luaState, -1);
                } else {
                    const callStatus = lua.lua_pcall(luaState, 0, lua.LUA_MULTRET, 0);
                    if (callStatus !== lua.LUA_OK) {
                        pixel.output = "Runtime error: " + lua.lua_tojsstring(luaState, -1);
                    } else {
                        pixel.output = lua.lua_tojsstring(luaState, -1) || "(no return)";
                    }
                }
            } catch (e) {
                pixel.output = "JS error: " + e.message;
            }

            pixel.running = true;
        }
    };

    // --- Lua Computer Editor Tool (GUI) ---
    elements.luacomputer_editor = {
        name: "Edit Lua Code",
        color: "#00FF00",
        tool: function(pixel) {
            if (!pixel || pixel.element !== "luacomputer") return;
            if (!mouseIsDown) return; // ✅ only on click, not hover
            openLuaEditor(pixel);
        },
        category: "tools",
        desc: "Open a GUI editor for Lua Computers."
    };

    console.log("Lua Computer with GUI editor loaded!");
});
