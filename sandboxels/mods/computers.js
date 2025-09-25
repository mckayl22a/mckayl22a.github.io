// computers.js – Lua Computer Mod for Sandboxels

let mouseIsDown = false;
document.addEventListener("mousedown", () => mouseIsDown = true);
document.addEventListener("mouseup",   () => mouseIsDown = false);

let nextClusterId = 1;

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
            code: "-- Lua code here\nprint(\"Hello!\")",
            output: "",
            running: false,
            clusterId: null
        },
        desc: "A programmable Lua computer. Connect with other computers or cables to form a cluster.",

        tick: function(pixel) {
            // Already in a cluster?
            if (!pixel.clusterId) {
                pixel.clusterId = nextClusterId++;
            }

            // Cluster discovery: merge with neighbors
            let neighbors = [
                pixelMap[pixel.x+1]?.[pixel.y],
                pixelMap[pixel.x-1]?.[pixel.y],
                pixelMap[pixel.x]?.[pixel.y+1],
                pixelMap[pixel.x]?.[pixel.y-1],
            ];
            for (let n of neighbors) {
                if (!n) continue;
                if (n.element === "luacomputer" || n.element === "computer_cable") {
                    if (!n.clusterId) {
                        n.clusterId = pixel.clusterId;
                    } else {
                        pixel.clusterId = n.clusterId;
                    }
                }
            }

            // Run Lua once per cluster
            if (!pixel.running) {
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
        }
    };

    // --- Computer Cable Element ---
    elements.computer_cable = {
        name: "Computer Cable",
        color: "#666666",
        behavior: behaviors.WALL,
        category: "computers",
        state: "solid",
        conduct: 1,
        desc: "Links computers together into one cluster.",
        properties: {
            clusterId: null
        },
        tick: function(pixel) {
            // Link with neighbors
            let neighbors = [
                pixelMap[pixel.x+1]?.[pixel.y],
                pixelMap[pixel.x-1]?.[pixel.y],
                pixelMap[pixel.x]?.[pixel.y+1],
                pixelMap[pixel.x]?.[pixel.y-1],
            ];
            for (let n of neighbors) {
                if (!n) continue;
                if ((n.element === "luacomputer" || n.element === "computer_cable") && n.clusterId) {
                    pixel.clusterId = n.clusterId;
                }
            }
            if (!pixel.clusterId) pixel.clusterId = nextClusterId++;
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
            value: 0
        },
        tick: function(pixel) {
            // Placeholder
        }
    };

    // --- Screen Spawner Tool ---
    elements.screen_spawner = {
        name: "Screen Spawner",
        color: "#4444FF",
        tool: function(pixel) {
            if (!pixel || !mouseIsDown) return;
            if (pixel._spawningNow) return;
            pixel._spawningNow = true;

            let sizeStr = prompt("Enter grid size (e.g. 6 for 6x6):", "6");
            let gridSize = parseInt(sizeStr);
            if (isNaN(gridSize) || gridSize < 1) gridSize = 6;

            for (let y = 0; y < gridSize; y++) {
                for (let x = 0; x < gridSize; x++) {
                    let newX = pixel.x + 1 + x;
                    let newY = pixel.y + y;
                    if (isEmpty(newX, newY, true)) createPixel("screen_cell", newX, newY);
                }
            }

            document.addEventListener("mouseup", () => {
                pixel._spawningNow = false;
            }, { once: true });
        },
        category: "tools",
        desc: "Click to spawn a screen grid."
    };

    // --- Lua Computer Editor Tool ---
    elements.luacomputer_editor = {
        name: "Edit Lua Code",
        color: "#00FF00",
        tool: function(pixel) {
            if (!pixel || pixel.element !== "luacomputer") return;
            if (!mouseIsDown) return;
            if (pixel._editingNow) return;
            pixel._editingNow = true;

            const newCode = prompt("Enter Lua code:", pixel.code);
            if (newCode !== null) {
                pixel.code = newCode;
                pixel.running = false;
            }

            document.addEventListener("mouseup", () => {
                pixel._editingNow = false;
            }, { once: true });
        },
        category: "tools",
        desc: "Edit the Lua code of a Lua Computer."
    };

    console.log("Lua Computers + Cables + Tools loaded!");
});
