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
