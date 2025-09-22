// computers.js – Lua Computer mod

runAfterLoad(function() {
    elements.luacomputer = {
        name: "Lua Computer",
        color: "#3333BB",
        behavior: behaviors.WALL,
        category: "machines",
        state: "solid",
        conduct: 1,
        properties: {
            code: "-- Lua code here\nprint(\"Hello from Lua!\")",
            output: "",
            running: false
        },
        desc: "A programmable computer that runs Lua code. Right-click to edit.",

        tick: function(pixel) {
            if (pixel.running) return;

            if (typeof fengari === "undefined") {
                pixel.output = "Fengari (Lua VM) not loaded!";
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

    // Right-click editor
    if (typeof editPixel === "function") {
        const oldEdit = editPixel;
        editPixel = function(pixel) {
            if (pixel.element === "luacomputer") {
                const newCode = prompt("Enter Lua code:", pixel.code);
                if (newCode !== null) {
                    pixel.code = newCode;
                    pixel.running = false;
                }
            } else {
                oldEdit(pixel);
            }
        };
    }

    console.log("Lua Computer mod loaded!");
});
