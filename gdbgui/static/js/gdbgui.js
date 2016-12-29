/**
 * This is the main frontend file to make
 * an interactive ui for gdb. Besides libraries,
 * everything exists in this single js file. There
 * are several components, each of which have their
 * own top-level object.
 */

(function ($, _, Awesomplete) {
"use strict";

const ENTER_BUTTON_NUM = 13

const Status = {
    el: $('#status'),
    render: function(status){
        Status.el.text(status)
    },
    render_ajax_error_msg: function(data){
        if (data.responseJSON && data.responseJSON.message){
            Status.render(_.escape(data.responseJSON.message))
        }else{
            Status.render(`${data.statusText} (${data.status} error)`)
        }
    },
    render_from_gdb_mi_response: function(mi_obj){
        // Update status
        let status = [];
        if (mi_obj.message){
            status.push(mi_obj.message)
        }
        if (mi_obj.payload){
            if (mi_obj.payload.msg) {status.push(mi_obj.payload.msg)}
            if (mi_obj.payload.reason) {status.push(mi_obj.payload.reason)}
            if (mi_obj.payload.frame){
                for(let i of ['file', 'func', 'line']){
                    if (i in mi_obj.payload.frame){
                        status.push(`${i}: ${mi_obj.payload.frame[i]}`)
                    }
                }
            }
        }
        Status.render(status.join(', '))
    }
}

const History = {
    el: $('#command_history'),
    items: [],
    init: function(){
        $('.clear_history').click(function(e){History.clear(e)})
        $("body").on("click", ".sent_command", History.click_sent_command)

        try{
            History.items = _.uniq(JSON.parse(localStorage.getItem('history')))
        }catch(err){
            History.items = []
        }
        History.render()
    },
    onclose: function(){
        localStorage.setItem('history', JSON.stringify(History.items) || [])
        return null
    },
    clear: function(){
        History.items = []
        History.render()
    },
    update: function(cmd){
        History.save_to_history(cmd)
        History.render()
    },
    save_to_history: function(cmds){
        if (!_.isArray(cmds)){
            cmds = [cmds]
        }

        if (_.isArray(History.items)){
            _.remove(History.items, i => i in cmds)
            for(let cmd of cmds){
                History.items.unshift(cmd)
            }
        }else{
            History.items = cmds
        }
    },
    render: function(){
        let history_html = History.items.map(cmd => `<tr><td class="sent_command pointer" data-cmd="${cmd}" style="padding: 0">${cmd}</td></tr>`)
        History.el.html(history_html)
    },
    click_sent_command: function(e){
        // when a previously sent command is clicked, populate the command input
        // with it
        let previous_cmd_from_history = (e.currentTarget.dataset.cmd)
        GdbCommandInput.set_input_text(previous_cmd_from_history)
    },
}

const GdbApi = {
    init: function(){
        $('.gdb_cmd').click(function(e){GdbApi.click_gdb_cmd_button(e)})
        $('#stop_gdb').click(GdbApi.stop_gdb)
        $('.get_gdb_response').click(function(e){GdbApi.get_gdb_response(e)})
    },
    click_gdb_cmd_button: function(e){
        GdbApi.run_gdb_command(e.currentTarget.dataset.cmd)
    },
    stop_gdb: function(){
        $.ajax({
            url: "/stop_gdb",
            cache: false,
            type: 'GET',
            success: function(data){
                Status.render('gdb has exited')
            },
            error: Status.render_ajax_error_msg
        })
    },
    run_gdb_command: function(cmd){
        if(_.trim(cmd) === ''){
            return
        }

        Status.render(`running command "${cmd}"`)
        History.update(cmd)
        $.ajax({
            url: "/run_gdb_command",
            cache: false,
            method: 'POST',
            data: {'cmd': cmd},
            success: process_gdb_response,
            error: Status.render_ajax_error_msg
        })
    },
    get_gdb_response: function(){
        Status.render(`Getting GDB response`)
        $.ajax({
            url: "/get_gdb_response",
            cache: false,
            success: process_gdb_response,
            error: Status.render_ajax_error_msg
        })
    },
}

const Util = {
    get_table: function(columns, data) {
        var result = ["<table class='table table-striped table-bordered table-condensed'>"];
        result.push("<thead>")
        result.push("<tr>")
        for (let h of columns){
            result.push(`<th>${h}</th>`)
        }
        result.push("</tr>")
        result.push("</thead>")
        result.push("<tbody>")
        for(let row of data) {
                result.push("<tr>")
                for(let cell of row){
                        result.push(`<td>${cell}</td>`)
                }
                result.push("</tr>")
        }
        result.push("</tbody>")
        result.push("</table>")
        return result.join('\n')
    },
    get_table_data_from_objs: function(objs){
        // put keys of all objects into array
        let all_keys = _.flatten(objs.map(i => _.keys(i)))
        let columns = _.uniq(_.flatten(all_keys)).sort()

        let data = []
        for (let s of objs){
            let row = []
            for (let k of columns){
                row.push(k in s ? s[k] : '')
            }
            data.push(row)
        }
        return [columns, data]
    },
    escape: function(s){
        return s.replace(/([^\\]\\n)/g, '<br>')
                .replace(/\\t/g, '&nbsp')
                .replace(/\\"+/g, '"')
    }
}

const GdbConsoleComponent = {
    el: $('#console'),
    init: function(){
        $('.clear_console').click(function(e){GdbConsoleComponent.clear_console})
    },
    clear_console: function(){
        GdbConsoleComponent.el.html('')
    },
    add: function(s){
        GdbConsoleComponent.el.append(`<p class='no_margin output'>${Util.escape(s)}</span>`)
    },
    scroll_to_bottom: function(){
        GdbConsoleComponent.el.animate({'scrollTop': GdbConsoleComponent.el.prop('scrollHeight')})
    }
}

const StdoutStderr = {
    el: $('#stdout'),
    clear_stdout: function(){
        StdoutStderr.el.html('')
    },
    add_output: function(s){
        StdoutStderr.el.append(`<p class='pre no_margin output'>${s.replace(/[^(\\)]\\n/g)}</span>`)
    },
    scroll_to_bottom: function(){
        StdoutStderr.el.animate({'scrollTop': StdoutStderr.el.prop('scrollHeight')})
    }
}


const GdbMiOutput = {
    el: $('#gdb_mi_output'),
    clear: function(){
        GdbMiOutput.el.html('')
    },
    add_mi_output: function(mi_obj){
        const text_class = {
            'output': "",
            'notify': "text-info",
            'log': "text-primary",
            'status': "text-danger",
            'console': "text-info",
        }
        GdbMiOutput.el.append(`<p class='pre ${text_class[mi_obj.type]} no_margin output'>${mi_obj.type}:\n${JSON.stringify(mi_obj, null, 4).replace(/[^(\\)]\\n/g)}</span>`)
    },
    scroll_to_bottom: function(){
        GdbMiOutput.el.animate({'scrollTop': GdbMiOutput.el.prop('scrollHeight')})
    }
}

const Breakpoint = {
    el: $('#breakpoints'),
    breakpoints: [],
    render_breakpoint_table: function(){
        let [columns, data] = Util.get_table_data_from_objs(Breakpoint.breakpoints)
        Breakpoint.el.html(Util.get_table(columns, data))
    },
    remove_stored_breakpoints: function(){
        Breakpoint.breakpoints = []
    },
    remove_breakpoint_if_present: function(fullname, line){
        for (let b of Breakpoint.breakpoints){
            if (b.fullname === fullname && b.line === line){
                let cmd = [`-break-delete ${b.number}`, '-break-list']
                GdbApi.run_gdb_command(cmd)
            }
        }
    },
    store_breakpoint: function(breakpoint){
        Breakpoint.breakpoints.push(breakpoint)
    },
    get_breakpoint_lines_For_file: function(fullname){
        return Breakpoint.breakpoints.filter(b => b.fullname === fullname).map(b => parseInt(b.line))
    },
    assign_breakpoints_from_mi_response: function(payload){
        Breakpoint.remove_stored_breakpoints()
        for (let bkpt of payload.BreakpointTable.body){
            Breakpoint.store_breakpoint(bkpt)
        }
        Breakpoint.render_breakpoint_table()
    }
}

const SourceCode = {
    el: $('#code_table'),
    el_code_container: $('#code_container'),
    el_title: $('#source_code_heading'),
    rendered_source_file_fullname: null,
    rendered_source_file_line: null,
    init: function(){
        $("body").on("click", ".breakpoint", SourceCode.click_breakpoint)
        $("body").on("click", ".no_breakpoint", SourceCode.click_source_file_gutter_with_no_breakpoint)

    },
    cached_source_files: [],  // list with keys fullname, source_code
    click_breakpoint: function(e){
        let line = e.currentTarget.dataset.line
        // todo: embed fullname in the dom instead of depending on state
        Breakpoint.remove_breakpoint_if_present(SourceCode.rendered_source_file_fullname, line)
    },
    click_source_file_gutter_with_no_breakpoint: function(e){
        let line = e.currentTarget.dataset.line
        let cmd = [`-break-insert ${SourceCode.rendered_source_file_fullname}:${line}`, '-break-list']
        GdbApi.run_gdb_command(cmd)
    },
    render_cached_source_file: function(){
        SourceCode.fetch_and_render_file(SourceCode.rendered_source_file_fullname, SourceCode.rendered_source_file_line, false)
    },
    is_cached: function(fullname){
        return SourceCode.cached_source_files.some(f => f.fullname === fullname)
    },
    render_source_file: function(fullname, source_code, current_line=0, make_current_line_visible=false){
        current_line = parseInt(current_line)
        let line_num = 1,
            tbody = [],
            bkpt_lines = Breakpoint.get_breakpoint_lines_For_file(fullname)

        for (let line of source_code){
            let breakpoint_class = (bkpt_lines.indexOf(line_num) !== -1) ? 'breakpoint': 'no_breakpoint';
            let current_line_id = (line_num === current_line) ? 'id=current_line': '';
            tbody.push(`<tr class='source_code ${breakpoint_class}' data-line=${line_num}>
                <td class='gutter'><div></div></td>
                <td class='line_num'>${line_num}</td>
                <td class='line_of_code'><pre ${current_line_id}>${line}</pre></td>
                </tr>
                `)
            line_num++;
        }
        SourceCode.el_title.text(fullname)
        SourceCode.el.html(tbody.join(''))

        SourceCode.rendered_source_file_fullname = fullname
        SourceCode.rendered_source_file_line = current_line

        if(make_current_line_visible){
            SourceCode.make_current_line_visible()
        }
    },
    // call this to rerender a file when breakpoints change, for example
    rerender: function(){
        if(_.isString(SourceCode.rendered_source_file_fullname)){
            let make_current_line_visible = false
            SourceCode.fetch_and_render_file(SourceCode.rendered_source_file_fullname, SourceCode.rendered_source_file_line, make_current_line_visible)
        }
    },
    // fetch file and render it, or used cached file if we have it
    fetch_and_render_file: function(fullname, current_line=0, make_current_line_visible=false){
        if (!_.isString(fullname)){
            console.error('cannot render file without a name')

        } else if (SourceCode.is_cached(fullname)){
            // We have this cached locally, just use it!
            let f = _.find(SourceCode.cached_source_files, i => i.fullname === fullname)
            SourceCode.render_source_file(fullname, f.source_code, current_line, make_current_line_visible)

        } else {
            $.ajax({
                url: "/read_file",
                cache: false,
                type: 'GET',
                data: {path: fullname},
                success: function(response){
                    SourceCode.cached_source_files.push({'fullname': fullname, 'source_code': response.source_code})
                    SourceCode.render_source_file(fullname, response.source_code, current_line, make_current_line_visible)
                },
                error: Status.render_ajax_error_msg
            })
        }
    },
    make_current_line_visible: function(){
        let jq_current_line = $("#current_line")
        if (jq_current_line.length === 1){  // make sure a line is selected before trying to scroll to it
            let top_of_line = jq_current_line.position().top,
                top_of_table = jq_current_line.closest('table').position().top,
                container_height = SourceCode.el_code_container.height(),
                time_to_scroll = 0

            if ((top_of_line - top_of_table) > container_height){
                // line is out of view, scroll so it's in the middle of the table
                SourceCode.el_code_container.animate({'scrollTop': top_of_line - (top_of_table + container_height/2)}, 0)
            }

        }else{
            // there is no line to scroll to
        }
    },
    remove_current_line: function(){
        SourceCode.rendered_source_file_line = null
        let jq_current_line = $("#current_line")
        if (jq_current_line.length === 1){  // make sure a line is selected before trying to scroll to it
            jq_current_line.removeAttr('id')  // remove current line id
        }
    }
}

const SourceFileAutocomplete = {
    el: $('#source_file_input'),
    init: function(){
        SourceFileAutocomplete.el.keyup(SourceFileAutocomplete.keyup_source_file_input)

        // initialize list of source files
        SourceFileAutocomplete.input = new Awesomplete('#source_file_input', {
            minChars: 0,
            maxItems: 10000,
            list: [],
            // standard sort algorithm (the default Awesomeplete sort is weird)
            sort: (a, b) => {return a < b ? -1 : 1;}
        })

        // when dropdown button is clicked, toggle showing/hiding it
        Awesomplete.$('.dropdown-btn').addEventListener("click", function() {
            if (SourceFileAutocomplete.input.ul.childNodes.length === 0) {
                SourceFileAutocomplete.input.evaluate()
            }
            else if (SourceFileAutocomplete.input.ul.hasAttribute('hidden')) {
                SourceFileAutocomplete.input.open()
            }
            else {
                SourceFileAutocomplete.input.close()
            }
        })

        // perform action when an item is selected
         Awesomplete.$('#source_file_input').addEventListener('awesomplete-selectcomplete', function(e){
            SourceCode.fetch_and_render_file(e.currentTarget.value)
        })
    },
    keyup_source_file_input: function(e){
        if (e.keyCode === ENTER_BUTTON_NUM){
            SourceCode.fetch_and_render_file(e.currentTarget.value)
        }
    },
}

const Disassembly = {
    el_title: $('#disassembly_heading'),
    el: $('#disassembly'),
    init: function(){
        $('button#refresh_disassembly').click(Disassembly.refresh_disassembly)
    },
    refresh_disassembly: function(e){
        let file = SourceCode.rendered_source_file_fullname
        let line = SourceCode.rendered_source_file_line
        if (file !== null && line !== null){
            line = Math.max(line - 10, 1)
            // https://sourceware.org/gdb/onlinedocs/gdb/GDB_002fMI-Data-Manipulation.html
            const mi_response_format = 4
            GdbApi.run_gdb_command(`-data-disassemble -f ${file} -l ${line} -- ${mi_response_format}`)
        } else {
            Status.render('gdbgui is not sure which file and line to disassemble. Reach a breakpoint, then try again.')
        }
    },
    render_disasembly: function(asm_insns){
        let thead = [ 'line', 'function+offset address instruction']
        let data = []
        for(let i of asm_insns){
            let content = i['line_asm_insn'].map(el => `${el['func-name']}+${el['offset']} ${el.address} ${el.inst}`)
            data.push([i['line'], content.join('<br>')])
        }
        Disassembly.el_title.html(asm_insns['fullname'])
        Disassembly.el.html(Util.get_table(thead, data))
    },
}

const Stack = {
    el: $('#stack'),
    render_stack: function(stack){
        let [columns, data] = Util.get_table_data_from_objs(stack)
        Stack.el.html(Util.get_table(columns, data))
    },
}

const Registers = {
    el: $('#registers'),
    register_names: [],
    render_registers(register_values){
        if(Registers.register_names.length === register_values.length){
            let columns = ['name', 'value']
            let register_table_data = []

            for (let i in Registers.register_names){
                let name = Registers.register_names[i]
                let obj = _.find(register_values, v => v['number'] === i)
                if (obj){
                    register_table_data.push([name, obj['value']])
                }else{
                    register_table_data.push([name, ''])
                }
            }
            Registers.el.html(Util.get_table(columns, register_table_data))
        } else {
            console.error('Could not render registers. Length of names != length of values!')
        }
    },
    set_register_names: function(names){
        // filter out non-empty names
        Registers.register_names = names.filter(name => name)
    }
}

const BinarySelection = {
    el: $('#binary'),
    init: function(){
        // events
        $('#set_target_app').click(BinarySelection.set_target_app_from_event)
        BinarySelection.el.keydown(BinarySelection.keydown_on_binary_input)

        // get old binaries list
        try{
            BinarySelection.past_binaries = _.uniq(JSON.parse(localStorage.getItem('past_binaries')))
            BinarySelection.render(BinarySelection.past_binaries[0])
        } catch(err){
            BinarySelection.past_binaries = []
        }
        // update list of old binarys
        BinarySelection.render_past_binary_options_datalist()
    },
    onclose: function(){
        localStorage.setItem('past_binaries', JSON.stringify(BinarySelection.past_binaries) || [])
        return null
    },
    past_binaries: [],
    set_target_app_from_event: function(e){
        var binary = BinarySelection.el.val()
        _.remove(BinarySelection.past_binaries, i => i === binary)
        BinarySelection.past_binaries.unshift(binary)
        BinarySelection.render_past_binary_options_datalist()
        GdbApi.run_gdb_command(`-file-exec-and-symbols ${binary}`)
    },
    render: function(binary){
        BinarySelection.el.val(binary)
    },
    render_past_binary_options_datalist: function(){
        $('#past_binaries').html(BinarySelection.past_binaries.map(b => `<option>${b}</option`))
    },
    keydown_on_binary_input: function(e){
        if(e.keyCode === ENTER_BUTTON_NUM) {
            BinarySelection.set_target_app_from_event(e)
        }
    },
}

const GdbCommandInput = {
    el: $('#gdb_command'),
    init: function(){
        GdbCommandInput.el.keydown(GdbCommandInput.keydown_on_gdb_cmd_input)
        $('.run_gdb_command').click(GdbCommandInput.run_gdb_command)
    },
    keydown_on_gdb_cmd_input: function(e){
        if(e.keyCode === ENTER_BUTTON_NUM) {
            GdbCommandInput.run_current_command()
        }
    },
    run_current_command: function(){
        GdbApi.run_gdb_command(GdbCommandInput.el.val())
    },
    set_input_text: function(new_text){
        GdbCommandInput.el.val(new_text)
    }
}

const GlobalEvents = {
    // Initialize
    init: function(){
        GlobalEvents.register_events()
    },
    // Event handling
    register_events: function(){
        $(window).keydown(function(e){
            if((event.keyCode === ENTER_BUTTON_NUM)) {
                // when pressing enter in an input, don't redirect entire page
                event.preventDefault()
            }
        })

        $("body").on("click", ".resizer", GlobalEvents.click_resizer_button)
    },
    click_resizer_button: function(e){
        let jq_selection = $(e.currentTarget.dataset['target_selector'])
        let cur_height = jq_selection.height()
        if (e.currentTarget.dataset['resize_type'] === 'enlarge'){
            jq_selection.height(cur_height + 50)
        } else if (e.currentTarget.dataset['resize_type'] === 'shrink'){
            if (cur_height > 50){
                jq_selection.height(cur_height - 50)
            }
        } else {
            console.error('unknown resize type ' + e.currentTarget.dataset['resize_type'])
        }
    },
}

const process_gdb_response = function(response_array){
    for (let r of response_array){
        if (r.type === 'result' && r.message === 'done' && r.payload){
            // This is special GDB Machine Interface structured data that we
            // can render in the frontend
            if ('bkpt' in r.payload){
                // breakpoint was created
                Breakpoint.store_breakpoint(r.payload.bkpt)
                Breakpoint.render_breakpoint_table()
                SourceCode.fetch_and_render_file(r.payload.bkpt.fullname, r.payload.bkpt.line, true)

            } else if ('BreakpointTable' in r.payload){
                Breakpoint.assign_breakpoints_from_mi_response(r.payload)
                SourceCode.rerender()

            } else if ('stack' in r.payload) {
                Stack.render_stack(r.payload.stack)

            } else if ('register-names' in r.payload) {
                Registers.set_register_names(r.payload['register-names'])

            } else if ('register-values' in r.payload) {
                Registers.render_registers(r.payload['register-values'])

            } else if ('asm_insns' in r.payload) {
                Disassembly.render_disasembly(r.payload.asm_insns)

            } else if ('files' in r.payload){
                SourceFileAutocomplete.input.list = _.uniq(r.payload.files.map(f => f.fullname)).sort()
                SourceFileAutocomplete.input.evaluate()
            } // else if (your check here) {
            //      render your custom compenent here!
            // }

        } else if (r.type === 'console'){
            GdbConsoleComponent.add(r.payload)
        }

        if (r.type === 'output'){
            // output of program
            StdoutStderr.add_output(r.payload)
        }else{
            // gdb mi output
            GdbMiOutput.add_mi_output(r)
        }

        if (r.payload && typeof r.payload.frame !== 'undefined') {
            // Stopped on a frame. We can render the file and highlight the line!
            SourceCode.fetch_and_render_file(r.payload.frame.fullname, r.payload.frame.line, true)
        }

        if (r.message && r.message === 'stopped' && r.payload && r.payload.reason && r.payload.reason.includes('exited')){
            SourceCode.remove_current_line()
        }

    }

    // render response of last element of array
    Status.render_from_gdb_mi_response(_.last(response_array))

    // scroll to the bottom
    StdoutStderr.scroll_to_bottom()
    GdbMiOutput.scroll_to_bottom()
    GdbConsoleComponent.scroll_to_bottom()
}

// initialize components
GlobalEvents.init()
GdbApi.init()
GdbCommandInput.init()
GdbConsoleComponent.init()
SourceCode.init()
Disassembly.init()
History.init()
BinarySelection.init()
SourceFileAutocomplete.init()

window.addEventListener("beforeunload", BinarySelection.onclose)
window.addEventListener("beforeunload", History.onclose)

})(jQuery, _, Awesomplete)
