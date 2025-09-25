runAfterLoad(function() {
    let mouseIsDown = false;
    document.addEventListener("mousedown", () => mouseIsDown = true);
    document.addEventListener("mouseup",   () => mouseIsDown = false);

    // --- GUI Containers ---
    const guiContainer = document.createElement("div");
    guiContainer.id = "computer-gui-container";
    Object.assign(guiContainer.style, {
        position: "absolute",
        top: "50px",
        left: "50px",
        zIndex: 1000,
        background: "#222",
        color: "#fff",
        padding: "10px",
        border: "2px solid #555",
        display: "none",
        minWidth: "300px",
        maxWidth: "600px",
        borderRadius: "8px",
    });
    document.body.appendChild(guiContainer);

    // --- Lua Editor GUI ---
    const luaEditor = document.createElement("textarea");
    Object.assign(luaEditor.style, {
        width: "100%",
        height: "200px",
        background: "#111",
        color: "#0f0",
        fontFamily: "monospace",
        fontSize: "14px",
    });
    guiContainer.appendChild(luaEditor);

    const saveLuaBtn = document.createElement("button");
    saveLuaBtn.innerText = "Save Lua Code";
    guiContainer.appendChild(saveLuaBtn);

    const closeGuiBtn = document.createElement("button");
    closeGuiBtn.innerText = "Close";
    Object.assign(closeGuiBtn.style, { marginLeft: "10px" });
    guiContainer.appendChild(closeGuiBtn);

    // --- Network Rename GUI ---
    const renameInput = document.createElement("input");
    renameInput.placeholder = "Enter network name";
    renameInput.style.display = "none";
    guiContainer.appendChild(renameInput);

    const renameBtn = document.createElement("button");
    renameBtn.innerText = "Rename Network";
    renameBtn.style.display = "none";
    guiContainer.appendChild(renameBtn);

    let activePixel = null;

    // Show Lua editor GUI
    function openLuaEditor(pixel) {
        activePixel = pixel;
        luaEditor.value = pixel.code || "";
        luaEditor.style.display = "block";
        saveLuaBtn.style.display = "inline-block";
        renameInput.style.display = "none";
        renameBtn.style.display = "none";
        guiContainer.style.display = "block";
    }

    // Show Rename GUI
    function openRenameGui(pixel) {
        activePixel = pixel;
        renameInput.value = pixel.displayName || pixel.networkId;
        renameInput.style.display = "inline-block";
        renameBtn.style.display = "inline-block";
        luaEditor.style.display = "none";
        saveLuaBtn.style.display = "none";
        guiContainer.style.display = "block";
    }

    closeGuiBtn.onclick = () => {
        guiContainer.style.display = "none";
    };

    saveLuaBtn.onclick = () => {
        if (activePixel) {
            activePixel.code = luaEditor.value;
            activePixel.running = false;
        }
        guiContainer.style.display = "none";
    };

    renameBtn.onclick = () => {
        if (activePixel) {
            const newName = renameInput.value.trim();
            if (!newName) return;
            let targetId = activePixel.networkId;
            for (let row of pixelMap) {
                for (let p of row) {
                    if (p && p.networkId === targetId && (p.element === "luacomputer" || p.element === "screen_cell")) {
                        p.displayName = newName;
                    }
                }
            }
        }
        guiContainer.style.display = "none";
    };

    // --- Network Utilities ---
    function generateId() { return "id_" + Math.floor(Math.random() * 1e9).toString(36); }

    function connectNetworks(pixel, neighbors) {
        let foundId = pixel.networkId;
        for (let n of neighbors) {
            if (n && (n.element === "luacomputer" || n.element === "screen_cell") && n.networkId) {
                foundId = n.networkId;
                break;
            }
        }
        if (!foundId) foundId = generateId();
        if (pixel.element === "luacomputer" || pixel.element === "screen_cell") {
            pixel.networkId = foundId;
            if (!pixel.displayName) pixel.displayName = foundId;
        }
        for (let n of neighbors) {
            if (n && (n.element === "luacomputer" || n.element === "screen_cell")) {
                n.networkId = foundId;
                if (!n.displayName) n.displayName = foundId;
            }
        }
    }

    // --- Elements ---
    elements.luacomputer = {
        name: "Lua Computer",
        color: "#3333BB",
        behavior: behaviors.WALL,
        category: "computers",
        state: "solid",
        conduct: 1,
        properties: { code: "", output: "", running: false, networkId: null, displayName: null },
        tick: function(pixel) {
            let neighbors = [
                pixelMap[pixel.x]?.[pixel.y-1],
                pixelMap[pixel.x]?.[pixel.y+1],
                pixelMap[pixel.x-1]?.[pixel.y],
                pixelMap[pixel.x+1]?.[pixel.y]
            ];
            connectNetworks(pixel, neighbors);
            if (pixel.running || !pixel.code) return;
            if (typeof fengari === "undefined") { pixel.output = "Fengari not loaded!"; pixel.running=true; return; }
            try {
                const luaCode = pixel.code;
                const L = fengari.L, lua = fengari.lua, lauxlib = fengari.lauxlib, lualib = fengari.lualib, to_luastring = fengari.to_luastring;
                const luaState = lauxlib.luaL_newstate();
                lualib.luaL_openlibs(luaState);
                const status = lauxlib.luaL_loadstring(luaState, to_luastring(luaCode));
                if (status !== lua.LUA_OK) pixel.output = "Lua syntax error: " + lua.lua_tojsstring(luaState,-1);
                else {
                    const callStatus = lua.lua_pcall(luaState, 0, lua.LUA_MULTRET, 0);
                    if (callStatus !== lua.LUA_OK) pixel.output = "Runtime error: " + lua.lua_tojsstring(luaState,-1);
                    else pixel.output = lua.lua_tojsstring(luaState,-1) || "(no return)";
                }
            } catch(e){ pixel.output = "JS error: "+e.message; }
            pixel.running = true;
        }
    };

    elements.screen_cell = {
        name: "Screen Cell",
        color: "#222222",
        behavior: behaviors.WALL,
        category: "computers",
        state: "solid",
        properties: { value: 0, networkId: null, displayName: null },
        tick: function(pixel) {
            let neighbors = [
                pixelMap[pixel.x]?.[pixel.y-1],
                pixelMap[pixel.x]?.[pixel.y+1],
                pixelMap[pixel.x-1]?.[pixel.y],
                pixelMap[pixel.x+1]?.[pixel.y]
            ];
            connectNetworks(pixel, neighbors);
        }
    };

    elements.computer_cable = {
        name: "Computer Cable",
        color: "#666666",
        behavior: behaviors.WALL,
        category: "computers",
        state: "solid",
        desc: "Connects computers and screens into one network.",
        tick: function(pixel) {
            let neighbors = [
                pixelMap[pixel.x]?.[pixel.y-1],
                pixelMap[pixel.x]?.[pixel.y+1],
                pixelMap[pixel.x-1]?.[pixel.y],
                pixelMap[pixel.x+1]?.[pixel.y]
            ];
            connectNetworks(pixel, neighbors);
        }
    };

    // --- Tools ---
    elements.luacomputer_editor = {
        name: "Edit Lua Code",
        color: "#00FF00",
        tool: function(pixel) { if(pixel && pixel.element==="luacomputer" && mouseIsDown) openLuaEditor(pixel); },
        category: "tools",
        desc: "Open a GUI editor for Lua Computers."
    };

    elements.network_renamer = {
        name: "Rename Network",
        color: "#FFFF00",
        tool: function(pixel) { if(pixel && (pixel.element==="luacomputer"||pixel.element==="screen_cell") && mouseIsDown) openRenameGui(pixel); },
        category: "tools",
        desc: "Open a GUI to rename a network."
    };

    console.log("Lua Computer + Cables + GUI Editor + Renamer loaded!");
});
