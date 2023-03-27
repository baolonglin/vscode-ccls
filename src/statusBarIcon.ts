import { StatusBarAlignment, StatusBarItem, window, workspace } from "vscode";
import { Disposable } from "vscode-jsonrpc";
import { LanguageClient } from "vscode-languageclient/node";
import { cclsChan } from './globalContext';
import { dedent, unwrap } from './utils';
import * as fs from 'fs';
import * as path from 'path'


interface CclsInfoResponse {
  db: {
    files: number;
    funcs: number;
    types: number;
    vars: number;
  };
  pipeline: {
    lastIdle: number;
    completed: number;
    enqueued: number;
  };
  project: {
    entries: number;
  };
}

export class StatusBarIconProvider implements Disposable {
  private icon: StatusBarItem;
  private timer: NodeJS.Timer;
  private wasError = false;

  public constructor(private client: LanguageClient, private updateInterval: number) {
    this.icon = window.createStatusBarItem(StatusBarAlignment.Right);
    this.icon.text = "ccls: loading";
    this.icon.tooltip = "ccls is starting / loading project metadata";
    this.icon.show();

    this.timer = setInterval(this.updateStatus.bind(this), updateInterval);
  }

  public dispose() {
    clearInterval(this.timer);
    this.icon.dispose();
  }

  private getTarget() {
    const config = workspace.getConfiguration('ccls');
    let db_dir = config.get('misc.compilationDatabaseDirectory');
    if (!db_dir || db_dir === '') {
      const wss = workspace.workspaceFolders;
      if (wss !== undefined && wss.length > 0) {
        db_dir = wss[0].uri.fsPath;
      }
    }
    if (db_dir && db_dir !== '') {
      const db_path = db_dir + '/compile_commands.json';
      const db_real_path = fs.realpathSync(db_path);

      const file_name = path.parse(db_real_path).name
      if (file_name.startsWith("compile_commands_")) {
        return file_name.substring(17).toUpperCase()
      }
    }
    return '';
  }

  private async updateStatus() {
    let info: CclsInfoResponse;
    try {
      info = await this.client.sendRequest<CclsInfoResponse>("$ccls/info");
      this.wasError = false;
    } catch (e) {
      if (this.wasError)
        return;
      this.wasError = true;
      this.icon.text = "ccls: error";
      this.icon.color = "red";
      this.icon.tooltip = "Failed to perform info request: " + (e as Error).message;
      unwrap(cclsChan).show();
      return;
    }

    const lastIdle = info.pipeline.lastIdle || 0;
    const completed = info.pipeline.completed || 0;
    const enqueued = info.pipeline.enqueued || 0;
    this.icon.color = "";
    this.icon.text = `ccls(${this.getTarget()}): ${completed}/${enqueued} jobs`;
    this.icon.tooltip = `${info.db.files} files,
${info.db.funcs} functions,
${info.db.types} types,
${info.db.vars} variables,
${info.project.entries} entries in project.

completed ${completed}/${enqueued} index requests
last idle: ${lastIdle}`;
  }
}
