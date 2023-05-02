/********************************************************************************
 * Copyright (c) 2019-2022 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
import {
    Action,
    ActionMessage,
    ComputedBoundsAction,
    GLSPClient, MouseMoveAction,
    RequestModelAction, SelectionChangeAction,
    ServerMessageAction,
    SetEditModeAction, ViewportBoundsChangeAction
} from '@eclipse-glsp/protocol';
import { injectable } from 'inversify';
import { ActionHandlerRegistry, DiagramServerProxy, ExportSvgAction, ICommand, ServerStatusAction, SwitchEditModeCommand } from 'sprotty';
import { SourceUriAware } from '../base/source-uri-aware';

const receivedFromServerProperty = '__receivedFromServer';

@injectable()
export class GLSPDiagramServer extends DiagramServerProxy implements SourceUriAware {
    protected _sourceUri: string;
    protected _glspClient?: GLSPClient;
    protected ready = false;

    async connect(client: GLSPClient): Promise<GLSPClient> {
        await client.start();
        client.onActionMessage(message => this.messageReceived(message));
        this._glspClient = client;
        return this._glspClient;
    }

    public get glspClient(): GLSPClient | undefined {
        return this._glspClient;
    }

    protected sendMessage(message: ActionMessage): void {
        if (this.glspClient) {
            this.glspClient.sendActionMessage(message);
        } else {
            throw new Error('GLSPClient is not connected');
        }
    }

    override initialize(registry: ActionHandlerRegistry): void {
        registerDefaultGLSPServerActions(registry, this);
        registerCollaborationActions(registry, this);
        if (!this.clientId) {
            this.clientId = this.viewerOptions.baseDiv;
        }
    }

    override handle(action: Action): void | ICommand | Action {
        if (RequestModelAction.is(action) && action.options) {
            this._sourceUri = action.options.sourceUri as string;
        }
        return super.handle(action);
    }

    override handleLocally(action: Action): boolean {
        if (ServerMessageAction.is(action)) {
            return this.handleServerMessageAction(action);
        }
        if (SetEditModeAction.is(action)) {
            return this.handleSetEditModeAction(action);
        }
        return super.handleLocally(action);
    }

    protected handleServerMessageAction(action: ServerMessageAction): boolean {
        this.logger.log('GLSPDiagramServer', `[${action.severity}] -${action.message}`);
        return false;
    }

    protected override handleComputedBounds(_action: ComputedBoundsAction): boolean {
        return true;
    }

    protected handleSetEditModeAction(action: SetEditModeAction): boolean {
        return !isReceivedFromServer(action);
    }

    public get sourceURI(): string {
        return this._sourceUri;
    }
}

export function isReceivedFromServer(action: Action): boolean {
    return (action as any)[receivedFromServerProperty] === true;
}

export function registerDefaultGLSPServerActions(registry: ActionHandlerRegistry, diagramServer: DiagramServerProxy): void {
    registry.register(ServerMessageAction.KIND, diagramServer);
    registry.register(ServerStatusAction.KIND, diagramServer);
    registry.register(ExportSvgAction.KIND, diagramServer);

    // Register an empty handler for SwitchEditMode, to avoid runtime exceptions.
    // We don't support SwitchEditMode, but Sprotty still sends those actions, so ignore them.
    registry.register(SwitchEditModeCommand.KIND, { handle: action => undefined });
}

export function registerCollaborationActions(registry: ActionHandlerRegistry, diagramServer: DiagramServerProxy): void {
    registry.register(MouseMoveAction.KIND, diagramServer);
    registry.register(ViewportBoundsChangeAction.KIND, diagramServer);
    registry.register(SelectionChangeAction.KIND, diagramServer);
}
