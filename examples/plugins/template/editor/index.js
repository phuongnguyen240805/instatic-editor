/**
 * Template plugin — editor entrypoint.
 *
 * Demonstrates three levels of Command Spotlight (⌘K) integration:
 *
 *  1. Basic PluginCommand — registered with api.editor.commands.register.
 *     Auto-surfaces in the palette under "Plugin commands" with no extra work.
 *
 *  2. Richer PluginPaletteCommand — registered with
 *     api.editor.palette.registerCommand. Shows subtitle, iconName, args,
 *     destructive flag, and workspace gating.
 *
 *  3. PluginPaletteProvider — registered with
 *     api.editor.palette.registerProvider. Returns live search results on
 *     every debounced keystroke.
 *
 * All three require the editor.commands permission.
 */

var mod = {
  activate(api) {

    // ── 1. Basic PluginCommand ────────────────────────────────────────────────
    //
    // The minimum required shape: id + label + run.
    // Auto-appears in the Command Spotlight palette under "Plugin commands".
    // No extra code needed — every registered command is a palette citizen.

    api.editor.commands.register({
      id: 'acme.template.ping',
      label: 'Template Ping',
      run: function() {
        return { message: 'Template command fired!' }
      },
    })

    // Add a toolbar button that invokes the command above.
    // Requires the editor.toolbar permission.
    api.editor.toolbar.addButton({
      id: 'acme.template.ping',
      label: 'Ping',
      command: 'acme.template.ping',
    })

    // ── 2. Richer PluginPaletteCommand ───────────────────────────────────────
    //
    // api.editor.palette.registerCommand is equivalent to
    // api.editor.commands.register — both store into the same runtime registry.
    // Use it when you want to make the palette-specific intent explicit, or
    // when the command is NOT meant to appear as a toolbar button.
    //
    // Extended fields:
    //   subtitle     — shown beneath the label in the palette row
    //   iconName     — pixel-art-icon name (see docs for available icons)
    //   keywords     — extra search terms (low weight in the fuzzy matcher)
    //   destructive  — palette renders danger styling + inline confirm
    //   workspaces   — restrict to specific admin workspaces
    //   args         — declarative arguments collected before run()

    api.editor.palette.registerCommand({
      id: 'acme.template.greet',
      label: 'Greet user…',
      subtitle: 'Shows a greeting in the command result',
      iconName: 'person-wave',
      keywords: ['hello', 'hi', 'greet', 'welcome'],
      workspaces: ['any'],
      args: [
        {
          id: 'name',
          label: 'Name',
          type: 'text',
          placeholder: 'Your name',
        },
        {
          id: 'tone',
          label: 'Tone',
          type: 'select',
          options: [
            { value: 'formal',   label: 'Formal'   },
            { value: 'casual',   label: 'Casual'   },
            { value: 'friendly', label: 'Friendly' },
          ],
        },
      ],
      run: function() {
        // Args are collected by the palette before run() is called.
        // The palette injects them via the CommandRunContext (ctx.args).
        // At the plugin level, run() receives no args directly —
        // the host resolves them and calls run() once all args are filled.
        return { message: 'Greeting sent!' }
      },
    })

    // ── 3. PluginPaletteProvider ─────────────────────────────────────────────
    //
    // Providers return live search results on each debounced keystroke.
    // The host calls search(query) after 150 ms of inactivity and groups
    // the returned items under provider.label in the palette.
    //
    // Provider id MUST be namespaced under the plugin id: "<pluginId>.<name>".
    // Errors thrown by search() are caught — the palette shows an empty
    // group rather than crashing.

    api.editor.palette.registerProvider({
      id: 'acme.template.staticItems',  // namespaced under plugin id
      label: 'Template items',           // group header in results

      search: async function(query) {
        // Static demo items — replace with real data fetched from your
        // server entrypoint or an external API.
        var items = [
          { id: 'item-alpha',   title: 'Alpha item',   subtitle: 'First demo result'  },
          { id: 'item-beta',    title: 'Beta item',    subtitle: 'Second demo result' },
          { id: 'item-gamma',   title: 'Gamma item',   subtitle: 'Third demo result'  },
        ]

        var q = query.toLowerCase()
        var filtered = q
          ? items.filter(function(item) {
              return item.title.toLowerCase().includes(q) ||
                     item.subtitle.toLowerCase().includes(q)
            })
          : items

        return filtered.map(function(item) {
          return {
            id:       item.id,
            title:    item.title,
            subtitle: item.subtitle,
            iconName: 'file-text-solid',
            run: async function() {
              // Navigate, open a dialog, call your server route, etc.
              console.log('[acme.template] Selected:', item.title)
            },
          }
        })
      },
    })
  },
}

export default mod
export var activate = mod.activate
