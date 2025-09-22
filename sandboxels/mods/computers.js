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

    // --- Screen Spawner Tool ---
    elements.screen_spawner_tool = {
        name: "Screen Spawner Tool",
        color: "#4444FF",
        tool: function(pixel) {
            let sizeStr = prompt("Enter grid size (e.g. 6 for 6x6):", "6");
            let gridSize = parseInt(sizeStr);
            if (isNaN(gridSize) || gridSize < 1) gridSize = 6;

            // Create grid right next to clicked pixel
            for (let y = 0; y < gridSize; y++) {
                for (let x = 0; x < gridSize; x++) {
                    let newX = pixel.x + 1 + x;
                    let newY = pixel.y + y;
                    if (isEmpty(newX, newY, true)) {
                        createPixel("screen_cell", newX, newY);
                    }
                }
            }
        },
        category: "tools"
    };

    // --- Screen Cell ---
    elements.screen_cell = {
        name: "Screen Cell",
        color: "#222222",
        behavior: behaviors.WALL,
        category: "computers",
        state: "solid",
        properties: {
            value: 0
        }
    };

    // --- Lua Editor Tool ---
    elements.luacomputer_editor = {
        name: "Edit Lua Code",
        color: "#00FF00",
        tool: function(pixel) {
            if (!pixel || pixel.element !== "luacomputer") return;

            const newCode = prompt("Enter Lua code:", pixel.code);
            if (newCode !== null) {
                pixel.code = newCode;
                pixel.running = false; // re-run
            }
        },
        category: "tools"
    };

    console.log("Lua Computer + Screen loaded!");
});
