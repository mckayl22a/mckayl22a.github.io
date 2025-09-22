// computers.js – Lua Computer Mod for Sandboxels

runAfterLoad(function() {
    // --- Create new category "Computers" ---
    if (!Object.values(categories).includes("computers")) {
        categories.computers = "Computers";
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
            code: "-- Lua code here\nprint(\"Hello!\")",
            output: "",
            running: false
        },
        desc: "A programmable Lua computer. Use the Edit tool to change its code.",

        tick: function(pixel) {
            if (pixel.running) return;

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

    // --- Screen Element ---
    elements.computer_screen = {
    name: "Computer Screen",
    color: "#222222",
    behavior: behaviors.WALL,
    category: "computers",
    state: "solid",
    desc: "Displays output from a connected Lua Computer.",

    tick: function(pixel) {
        let message = null;

        // Look for Lua Computer neighbors
        let neighbors = adjacentCoords(pixel.x, pixel.y);
        for (let i = 0; i < neighbors.length; i++) {
            let [nx, ny] = neighbors[i];
            if (!isEmpty(nx, ny, true)) {
                let nPix = pixelMap[nx][ny];
                if (nPix.element === "luacomputer" && nPix.output) {
                    message = nPix.output.toString();
                    break;
                }
            }
        }

        // Default color (off)
        pixel.color = "#222222";

        // If output is found, display state by color
        if (message) {
            if (message.toLowerCase().includes("error")) {
                pixel.color = "#FF0000"; // red for errors
            } else if (!isNaN(Number(message))) {
                pixel.color = "#00FF00"; // green for numbers
            } else {
                pixel.color = "#FFFF00"; // yellow for text
            }
        }
    }
};


    // --- Tool for editing code ---
    elements.luacomputer_editor = {
        name: "Edit Lua Code",
        color: "#00FF00",
        tool: function(pixel) {
            if (pixel.element === "luacomputer") {
                const newCode = prompt("Enter Lua code:", pixel.code);
                if (newCode !== null) {
                    pixel.code = newCode;
                    pixel.running = false; // re-run
                }
            }
        },
        category: "tools"
    };

    console.log("Lua Computer + Screen loaded!");
});
