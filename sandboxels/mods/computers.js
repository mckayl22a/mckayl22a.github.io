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
        desc: "A programmable Lua computer. Use the Edit tool to change its code.",
        tick: function(pixel) {
            // your fengari execution logic here
        }
    };

    // Define a new tool
    elements.luacomputer_editor = {
        color: "#00FF00",
        tool: function(pixel) {
            if (pixel.element === "luacomputer") {
                const newCode = prompt("Enter Lua code:", pixel.code);
                if (newCode !== null) {
                    pixel.code = newCode;
                    pixel.running = false;
                }
            }
        },
        category: "tools"
    };
});
