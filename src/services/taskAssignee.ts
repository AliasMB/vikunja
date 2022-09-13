import AbstractService from './abstractService'
import TaskAssigneeModel from '@/models/taskAssignee'
import type {ITaskAssignee} from '@/modelTypes/ITaskAssignee'
import {formatISO} from 'date-fns'

export default class TaskAssigneeService extends AbstractService<ITaskAssignee> {
	constructor() {
		super({
			create: '/tasks/{taskId}/assignees',
			delete: '/tasks/{taskId}/assignees/{userId}',
		})
	}

	processModel(model) {
		model.created = formatISO(new Date(model.created))
		return model
	}

	modelFactory(data) {
		return new TaskAssigneeModel(data)
	}
}