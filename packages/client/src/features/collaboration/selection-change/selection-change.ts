/********************************************************************************
 * Copyright (c) 2021-2023 EclipseSource and others.
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
    ActionDispatcher, IActionHandler, SModelRoot
} from 'sprotty';
import {
    Action, DisposeSubclientAction,
    SelectionChangeAction
} from '@eclipse-glsp/protocol';
import {inject, injectable} from 'inversify';
import {IFeedbackActionDispatcher} from '../../tool-feedback/feedback-action-dispatcher';
import {TYPES} from '../../../base/types';
import {SelectionListener, SelectionService} from '../../select/selection-service';
import {BaseGLSPTool} from '../../tools/base-glsp-tool';
import {DrawSelectionIconAction, RemoveSelectionIconAction} from './selection-change-actions';

@injectable()
export class SelectionChangeTool extends BaseGLSPTool implements SelectionListener {
    static ID = 'glsp.selection-change-tool';

    @inject(TYPES.SelectionService) protected selectionService: SelectionService;

    get id(): string {
        return SelectionChangeTool.ID;
    }

    enable(): void {
        this.selectionService.register(this);
    }

    disable(): void {
        this.selectionService.deregister(this);
    }

    selectionChanged(root: Readonly<SModelRoot>, selectedElements: string[], deselectedElements: string[]): void {
        this.dispatchActions([SelectionChangeAction.create({
            selectedElements,
            deselectedElements
        })]);
    }

}

@injectable()
export class SelectionIconProvider implements IActionHandler {
    @inject(TYPES.IFeedbackActionDispatcher)
    protected feedbackActionDispatcher: IFeedbackActionDispatcher;

    @inject(TYPES.IActionDispatcher)
    protected actionDispatcher: ActionDispatcher;

    // Map<subclientId, Map<elementId, action>>
    protected lastActions: Map<string, Map<string, DrawSelectionIconAction>> = new Map();

    handle(action: Action): void {
        if (SelectionChangeAction.is(action) && action.initialSubclientInfo != null) {
            const lastActionsForSubclientId = this.lastActions.get(action.initialSubclientInfo.subclientId) || new Map<string, DrawSelectionIconAction>();
            const deleteActions: RemoveSelectionIconAction[] = [];
            action.deselectedElements.forEach(element => {
                lastActionsForSubclientId.delete(element);
                deleteActions.push(RemoveSelectionIconAction.create({
                    element,
                    initialSubclientInfo: action.initialSubclientInfo!
                }));
            });
            this.actionDispatcher.dispatchAll(deleteActions);

            action.selectedElements.forEach(element => {
                lastActionsForSubclientId.set(element, DrawSelectionIconAction.create({
                    element,
                    initialSubclientInfo: action.initialSubclientInfo!
                }));
            });
            this.lastActions.set(action.initialSubclientInfo.subclientId, lastActionsForSubclientId);
            this.feedbackActionDispatcher.registerFeedback(this, this.getActionsAsArray());
        }
        if (DisposeSubclientAction.is(action) && action.initialSubclientInfo != null) {
            const drawActions = this.lastActions.get(action.initialSubclientInfo.subclientId);
            if (drawActions) {
                const deleteActions = Array.from(drawActions.values()).map(drawAction =>
                    RemoveSelectionIconAction.create({
                        element: drawAction.element,
                        initialSubclientInfo: drawAction.initialSubclientInfo
                    })
                );
                this.actionDispatcher.dispatchAll(deleteActions);

                this.lastActions.delete(action.initialSubclientInfo.subclientId);
                this.feedbackActionDispatcher.registerFeedback(this, this.getActionsAsArray());
            }
        }
    }


    private getActionsAsArray(): DrawSelectionIconAction[] {
        return Array.from(this.lastActions.values()).map(map => Array.from(map.values())).flat();
    }
}