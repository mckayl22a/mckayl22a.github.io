// computers.js – Lua Computer Mod for Sandboxels

let mouseIsDown = false;
document.addEventListener("mousedown", () => mouseIsDown = true);
document.addEventListener("mouseup",   () => mouseIsDown = false);

runAfterLoad(function() {
    // --- Utility: Unique ID generator ---
    function generateId() {
        return "id_" + Math.floor(Math.random() * 1e9).toString(36);
    }

    // --- Networking helper ---
    function connectNetworks(pixel, neighbors) {
        let foundId = pixel.networkId;
        for (let n of neighbors) {
            if (n && (n.element === "luacomputer" || n.element === "screen_cell") && n.networkId) {
                foundId = n.networkId;
                break;
            }
        }
        if (!foundId) {
            foundId = generateId();
        }

        // Assign ID to this pixel if it's a computer/screen
        if (pixel.element === "luacomputer" || pixel.element === "screen_cell") {
            pixel.networkId = foundId;
            if (!pixel.displayName) pixel.displayName = foundId; // fallback name
        }

        // Propagate to neighbors
        for (let n of neighbors) {
            if (n && (n.element === "luacomputer" || n.element === "screen_cell")) {
                n.networkId = foundId;
                if (!n.displayName) n.displayName = foundId;
            }
        }
    }

    // --- Lua Computer ---
    elements.luacomputer = {
        name: "Lua Computer",
        color: "#3333BB",
        behavior: behaviors.WALL,
        category: "computers",
        state: "solid",
        conduct: 1,
        properties: {
            code: "",
            output: "",
            running: false,
            networkId: null,
            displayName: null
        },
        desc: "A programmable Lua computer. Right-click with the editor tool to change its code.",

        tick: function(pixel) {
            // Network linking
            let neighbors = [
                pixelMap[pixel.x]?.[pixel.y-1],
                pixelMap[pixel.x]?.[pixel.y+1],
                pixelMap[pixel.x-1]?.[pixel.y],
                pixelMap[pixel.x+1]?.[pixel.y]
            ];
            connectNetworks(pixel, neighbors);

            if (pixel.running) return;
            if (!pixel.code || pixel.code.trim() === "") return;

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

    // --- Screen Cell ---
    elements.screen_cell = {
        name: "Screen Cell",
        color: "#222222",
        behavior: behaviors.WALL,
        category: "computers",
        state: "solid",
        properties: {
            value: 0,
            networkId: null,
            displayName: null
        },
        desc: "A single cell in a computer screen grid. Joins a computer network when connected.",
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

    // --- Computer Cable ---
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

    // --- Lua Computer Editor Tool ---
    elements.luacomputer_editor = {
        name: "Edit Lua Code",
        color: "#00FF00",
        tool: function(pixel) {
            if (!pixel || pixel.element !== "luacomputer") return;
            if (!mouseIsDown) return;
            openLuaEditor(pixel);
        },
        category: "tools",
        desc: "Open a GUI editor for Lua Computers."
    };

    // --- Rename Network Tool ---
    elements.network_renamer = {
        name: "Rename Network ID",
        color: "#FFFF00",
        tool: function(pixel) {
            if (!pixel || !(pixel.element === "luacomputer" || pixel.element === "screen_cell")) return;
            if (!mouseIsDown) return;

            let newName = prompt("Enter new name for network:", pixel.displayName || pixel.networkId);
            if (newName && newName.trim() !== "") {
                let targetId = pixel.networkId;
                for (let row of pixelMap) {
                    for (let p of row) {
                        if (p && p.networkId === targetId && (p.element === "luacomputer" || p.element === "screen_cell")) {
                            p.displayName = newName;
                        }
                    }
                }
            }
        },
        category: "tools",
        desc: "Rename the ID of a network to a custom name."
    };

    console.log("Lua Computer + Cables + Network IDs + Renamer loaded!");
});
