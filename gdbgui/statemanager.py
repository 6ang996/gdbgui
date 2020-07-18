import logging
import traceback
from collections import defaultdict
from typing import Any, Dict, List, Optional
import copy
from pygdbmi.gdbfiledescriptorcontroller import GdbFileDescriptorController

from .pty import Pty

logger = logging.getLogger(__name__)
GDB_MI_FLAG = ["--interpreter=mi2"]


class StateManager(object):
    def __init__(self, config: Dict[str, Any]):
        self.controller_to_client_ids: Dict[
            GdbFileDescriptorController, List[str]
        ] = defaultdict(
            list
        )  # key is controller, val is list of client ids

        self.pty_to_client_ids: Dict[Pty, List[str]] = defaultdict(
            list
        )  # key is controller, val is list of client ids
        self.gdb_reader_thread = None
        self.config = config

    def get_gdb_args(self):
        gdb_args = copy.copy(GDB_MI_FLAG)
        if self.config["gdb_args"]:
            gdb_args += self.config["gdb_args"]

        if self.config["initial_binary_and_args"]:
            gdb_args += ["--args"]
            gdb_args += self.config["initial_binary_and_args"]
        return gdb_args

    def connect_client(self, client_id: str, desired_gdbpid: int) -> Dict[str, Any]:
        message = ""
        pid: Optional[int] = 0
        error = False
        using_existing = False

        if desired_gdbpid > 0:
            controller = self.get_controller_from_pid(desired_gdbpid)

            if controller:
                self.controller_to_client_ids[controller].append(client_id)
                message = ("gdbgui is using existing subprocess with pid %s") % (
                    str(desired_gdbpid)
                )
                using_existing = True
                pid = desired_gdbpid
            else:
                print("error! could not find that pid")
                message = "Could not find a gdb subprocess with pid %s. " % str(
                    desired_gdbpid
                )
                error = True

        if self.get_controller_from_client_id(client_id) is None:
            logger.info("new sid", client_id)

            gdb_args = self.get_gdb_args()

            pty_mi = Pty([], fork=False)
            controller = GdbFileDescriptorController(pty_mi.stdin, pty_mi.stdout)
            self.controller_to_client_ids[controller].append(client_id)

            pty_command = (
                [self.config["gdb_path"]]
                + deepcopy(self.config["initial_binary_and_args"])
                + deepcopy(self.config["gdb_args"])
                + ["-ex", f"new-ui mi2 {pty_mi.name}"]
            )

            pty = Pty(pty_command, fork=True)
            self.pty_to_client_ids[pty].append(client_id)

            # pid = self.get_pid_from_controller(controller)
            # if pid is None:
            #     error = True
            #     message = "Developer error"
            # else:
            #     message += "gdbgui spawned subprocess with pid %s." % (str(pid),)

        return {
            "pid": pid,
            "message": message,
            "error": error,
            "using_existing": using_existing,
        }

    def remove_gdb_controller_by_pid(self, gdbpid: int) -> List[str]:
        controller = self.get_controller_from_pid(gdbpid)
        if controller:
            orphaned_client_ids = self.remove_gdb_controller(controller)
        else:
            logger.info("could not find gdb controller with pid " + str(gdbpid))
            orphaned_client_ids = []
        return orphaned_client_ids

    def remove_gdb_controller(
        self, controller: GdbFileDescriptorController
    ) -> List[str]:
        try:
            controller.terminate()
        except Exception:
            logger.error(traceback.format_exc())
        orphaned_client_ids = self.controller_to_client_ids.pop(controller, [])
        return orphaned_client_ids

    def get_client_ids_from_gdb_pid(self, pid: int) -> List[str]:
        controller = self.get_controller_from_pid(pid)
        if controller:
            return self.controller_to_client_ids.get(controller, [])
        return []

    def get_client_ids_from_controller(self, controller: GdbFileDescriptorController):
        return self.controller_to_client_ids.get(controller, [])

    # def get_pid_from_controller(
    #     self, controller: GdbFileDescriptorController
    # ) -> Optional[int]:
    #     if controller and controller.pid:
    #         return controller.pid

    #     return None

    # def get_controller_from_pid(
    #     self, pid: int
    # ) -> Optional[GdbFileDescriptorController]:
    #     for controller in self.controller_to_client_ids:
    #         this_pid = self.get_pid_from_controller(controller)
    #         if this_pid == pid:
    #             return controller

    #     return None

    def get_controller_from_client_id(
        self, client_id: str
    ) -> Optional[GdbFileDescriptorController]:
        for controller, client_ids in self.controller_to_client_ids.items():
            if client_id in client_ids:
                return controller

        return None

    def get_pty_from_client_id(self, client_id: str) -> Optional[Pty]:
        for pty, client_ids in self.pty_to_client_ids.items():
            if client_id in client_ids:
                return pty

        return None

    def exit_all_gdb_processes(self):
        logger.info("exiting all subprocesses")
        for controller in self.controller_to_client_ids:
            controller.terminate()
            self.controller_to_client_ids.pop(controller)

    def get_dashboard_data(self):
        data = {}
        for controller, client_ids in self.controller_to_client_ids.items():
            # if controller.gdb_process:
            #     pid = str(controller.gdb_process.pid)
            # else:
            #     pid = "process no longer exists"
            data[controller] = {
                "cmd": " ".join(controller.cmd),
                "abs_gdb_path": controller.abs_gdb_path,
                "number_of_connected_browser_tabs": len(client_ids),
                "client_ids": client_ids,
            }
        return data

    def disconnect_client(self, client_id: str):
        for _, client_ids in self.controller_to_client_ids.items():
            if client_id in client_ids:
                client_ids.remove(client_id)

    def _spawn_new_gdb_controller(self):
        pass

    def _connect_to_existing_gdb_controller(self):
        pass
