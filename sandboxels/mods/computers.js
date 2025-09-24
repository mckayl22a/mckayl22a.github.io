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
            // Placeholder for future computer/screen link
        }
    };


// --- Screen Spawner Tool ---
elements.screen_spawner = {
    name: "Screen Spawner",
    color: "#4444FF",
    tool: function(pixel) {
        if (!pixel) return;

        // Guard against multiple prompts per click
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

        // Release lock
        setTimeout(() => { pixel._spawningNow = false; }, 200);
    },
    category: "tools",
    desc: "Click on a pixel to spawn a screen grid to its right."
};

    // --- Lua Computer Editor Tool ---
elements.luacomputer_editor = {
    name: "Edit Lua Code",
    color: "#00FF00",
    tool: function(pixel) {
        if (!pixel || pixel.element !== "luacomputer") return;

        // Only act on actual click, not hover
        if (!mouseDown) return;

        // Guard so it runs once per click
        if (pixel._editingNow) return;
        pixel._editingNow = true;

        const newCode = prompt("Enter Lua code:", pixel.code);
        if (newCode !== null) {
            pixel.code = newCode;
            pixel.running = false;
        }

        // Reset guard when mouse is released
        document.addEventListener("mouseup", () => {
            pixel._editingNow = false;
        }, { once: true });
    },
    category: "tools",
    desc: "Edit the Lua code of a Lua Computer."
};

    console.log("Lua Computer + Screen + Tools loaded!");
});
