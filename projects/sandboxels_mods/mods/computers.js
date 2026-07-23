// computers.js – Lua Computer Mod for Sandboxels

runAfterLoad(function() {

    // --- Lua Computer Element ---
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
            networkId: null
        },
        desc: "A programmable Lua computer. Connect with cables to form networks.",
        tick: function(pixel) {
            if (pixel.running) return;

            if (!pixel.code) return; // no code to run

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

    // --- Screen Cell Element ---
    elements.screen_cell = {
        name: "Screen Cell",
        color: "#222222",
        behavior: behaviors.WALL,
        category: "computers",
        state: "solid",
        desc: "A single cell in a computer screen grid.",
        properties: {
            value: 0,
            networkId: null
        },
        tick: function(pixel) {
            // placeholder
        }
    };

    // --- Computer Cable Element ---
    elements.computer_cable = {
        name: "Computer Cable",
        color: "#FF8800",
        behavior: behaviors.WALL,
        category: "computers",
        state: "solid",
        desc: "Connects computers and screens into one network.",
        properties: {},
        tick: function(pixel) {
            // propagate network IDs to connected elements
            const neighbors = getNeighbors(pixel);
            for (const n of neighbors) {
                if ((n.element === "luacomputer" || n.element === "screen_cell") && n.networkId) {
                    assignNetwork(pixel, n.networkId);
                }
            }
        }
    };

    // --- Utilities ---
    let nextNetworkId = 1;
    function assignNetwork(pixel, id) {
        if (!pixel) return;
        if (pixel.element === "luacomputer" || pixel.element === "screen_cell") {
            pixel.networkId = id;
        }
    }

    function getNeighbors(pixel) {
        const neighbors = [];
        const offsets = [[0,1],[1,0],[0,-1],[-1,0]];
        for (const [dx, dy] of offsets) {
            const n = pixelAt(pixel.x+dx, pixel.y+dy);
            if (n) neighbors.push(n);
        }
        return neighbors;
    }

    // --- GUI Setup ---
    const guiContainer = document.createElement("div");
    guiContainer.style.position = "fixed";
    guiContainer.style.top = "10px";
    guiContainer.style.right = "10px";
    guiContainer.style.background = "#111";
    guiContainer.style.color = "#fff";
    guiContainer.style.padding = "10px";
    guiContainer.style.borderRadius = "5px";
    guiContainer.style.zIndex = 10000;
    guiContainer.style.display = "none";
    document.body.appendChild(guiContainer);

    const luaEditor = document.createElement("textarea");
    luaEditor.rows = 10;
    luaEditor.cols = 30;
    guiContainer.appendChild(luaEditor);

    const saveLuaBtn = document.createElement("button");
    saveLuaBtn.textContent = "Save Lua";
    saveLuaBtn.style.display = "block";
    saveLuaBtn.style.marginTop = "5px";
    guiContainer.appendChild(saveLuaBtn);

    const renameInput = document.createElement("input");
    renameInput.placeholder = "Network Name";
    renameInput.style.display = "none";
    guiContainer.appendChild(renameInput);

    const renameBtn = document.createElement("button");
    renameBtn.textContent = "Rename Network";
    renameBtn.style.display = "none";
    guiContainer.appendChild(renameBtn);

    let currentPixel = null;

    function openLuaEditor(pixel) {
        currentPixel = pixel;
        luaEditor.value = pixel.code || "";
        luaEditor.style.display = "block";
        saveLuaBtn.style.display = "block";
        renameInput.style.display = "none";
        renameBtn.style.display = "none";
        guiContainer.style.display = "block";
    }

    saveLuaBtn.onclick = function() {
        if (currentPixel) {
            currentPixel.code = luaEditor.value;
            currentPixel.running = false;
        }
    };

    function openRenameGui(pixel) {
        currentPixel = pixel;
        luaEditor.style.display = "none";
        saveLuaBtn.style.display = "none";
        renameInput.style.display = "inline-block";
        renameBtn.style.display = "inline-block";
        guiContainer.style.display = "block";
    }

    renameBtn.onclick = function() {
        if (!currentPixel) return;
        const name = renameInput.value.trim();
        if (!name) return;

        const netId = currentPixel.networkId || nextNetworkId++;
        const elementsToRename = getNetworkElements(currentPixel);
        for (const p of elementsToRename) p.networkId = netId;
        currentPixel.networkName = name;
        guiContainer.style.display = "none";
    };

    function getNetworkElements(pixel) {
        const seen = new Set();
        const queue = [pixel];
        while (queue.length > 0) {
            const p = queue.shift();
            if (!p || seen.has(p)) continue;
            seen.add(p);
            if ((p.element === "luacomputer" || p.element === "screen_cell") && p.networkId === pixel.networkId) {
                const neighbors = getNeighbors(p);
                for (const n of neighbors) {
                    if ((n.element === "luacomputer" || n.element === "screen_cell") && n.networkId === p.networkId) {
                        queue.push(n);
                    }
                }
            }
        }
        return Array.from(seen);
    }

    // --- Tools ---
    elements.screen_spawner = {
        name: "Screen Spawner",
        color: "#4444FF",
        tool: function(pixel) {
            if (!pixel) return;
            let sizeStr = prompt("Enter grid size (e.g. 6 for 6x6):", "6");
            let gridSize = parseInt(sizeStr);
            if (isNaN(gridSize) || gridSize < 1) gridSize = 6;
            for (let y=0;y<gridSize;y++){
                for(let x=0;x<gridSize;x++){
                    let newX = pixel.x+1+x;
                    let newY = pixel.y+y;
                    if (isEmpty(newX,newY,true)) createPixel("screen_cell", newX, newY);
                }
            }
        },
        category: "tools",
        desc: "Click on a pixel to spawn a screen grid to its right."
    };

    elements.luacomputer_editor = {
        name: "Edit Lua Code",
        color: "#00FF00",
        tool: function(pixel) {
            if (pixel && pixel.element === "luacomputer") openLuaEditor(pixel);
        },
        category: "tools",
        desc: "Open GUI editor for Lua Computers."
    };

    elements.network_renamer = {
        name: "Rename Network",
        color: "#FFFF00",
        tool: function(pixel) {
            if (pixel && (pixel.element === "luacomputer" || pixel.element === "screen_cell")) openRenameGui(pixel);
        },
        category: "tools",
        desc: "Open GUI to rename a network."
    };

    console.log("Lua Computer + Screen + Cables + GUI tools loaded!");
});
