#!/usr/bin/env python
from flask import Flask, render_template, jsonify
import os
import argparse
from flask import request
import signal
from pygdbmi.gdbcontroller import GdbController
import webbrowser


BASE_PATH = os.path.dirname(os.path.realpath(__file__))
TEMPLATE_DIR = os.path.join(BASE_PATH, 'templates')
STATIC_DIR = os.path.join(BASE_PATH, 'static')
DEFAULT_HOST = '0.0.0.0'
DEFAULT_PORT = 5000


app = Flask(__name__, template_folder=TEMPLATE_DIR, static_folder=STATIC_DIR)
app.jinja_env.add_extension('pyjade.ext.jinja.PyJadeExtension')

gdb = None


def server_error(obj):
    return jsonify(obj), 500


def client_error(obj):
    return jsonify(obj), 400


def get_extra_files():
    extra_files = []
    for dirname, dirs, files in os.walk(TEMPLATE_DIR):
        for filename in files:
            filename = os.path.join(dirname, filename)
            if os.path.isfile(filename):
                extra_files.append(filename)
    return extra_files


@app.route('/')
def gdbgui():
    """Render the main gdbgui interface"""
    return render_template('gdbgui.jade')


@app.route('/run_gdb_command', methods=['POST'])
def run_gdb_command():
    """Run a gdb command"""
    if gdb is not None:
        try:
            cmd = request.form.get('cmd') or request.form.getlist('cmd[]')
            response = gdb.write(cmd)
            return jsonify(response)
        except Exception as e:
            return server_error({'message': str(e)})
    else:
        return client_error({'message': 'gdb is not running'})


@app.route('/get_gdb_response')
def get_gdb_response():
    """Return output from gdb.get_gdb_response"""
    if gdb is not None:
        try:
            response = gdb.get_gdb_response(timeout_sec=0, raise_error_on_timeout=False)
            return jsonify(response)
        except Exception as e:
            return server_error({'message': str(e)})
    else:
        return client_error({'message': 'gdb is not running'})


@app.route('/read_file')
def read_file():
    """Read a file and return its contents as an array"""
    path = request.args.get('path')
    if path and os.path.isfile(path):
        try:
            with open(path, 'r') as f:
                return jsonify({'source_code': f.read().splitlines(),
                                'path': path})
        except Exception as e:
            return client_error({'message': '%s' % e})

    else:
        return client_error({'message': 'File not found: %s' % path})


def signal_handler(signal, frame):
    """handle ctrl+c (SIGINT) to make sure the child gdb process is killed"""
    print("Received signal %s. Shutting down gdbgui." % signal)
    if gdb is not None:
        try:
            gdb.exit()
            print('successfully killed child gdb process before exiting')
            exit(0)
        except Exception as e:
            print('failed to kill child gdb process before exiting (%s)' % e)
            exit(1)


def quit_backend():
    """Shutdown the flask server. Used when programmitcally testing gdbgui"""
    gdb.exit()
    func = request.environ.get('werkzeug.server.shutdown')
    if func is None:
        raise RuntimeError('Not running with the Werkzeug Server')
    func()


def open_browser(host, port):
    if host.startswith('http'):
        url = '%s:%s' % (host, port)
    else:
        url = 'http://%s:%s' % (host, port)
    print(" * Opening gdbgui in browser (%s)" % url)
    webbrowser.open(url)


def setup_backend(serve=True, host=DEFAULT_HOST, port=DEFAULT_PORT, debug=False, view=True):
    """Run the server of the gdb gui"""
    global gdb
    signal.signal(signal.SIGINT, signal_handler)
    gdb = GdbController()
    app.secret_key = 'iusahjpoijeoprkge[0irokmeoprgk890'
    app.debug = debug
    app.config['TEMPLATES_AUTO_RELOAD'] = True

    if serve:
        if view:
            open_browser(host, port)
        app.run(host=host, port=port, extra_files=get_extra_files())


def main():
    """Entry point from command line"""
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", default=DEFAULT_PORT)
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--debug", action='store_true')
    parser.add_argument("--view", action='store_true')
    args = parser.parse_args()
    setup_backend(serve=True, host=args.host, port=args.port, debug=args.debug, view=args.view)


if __name__ == '__main__':
    main()
