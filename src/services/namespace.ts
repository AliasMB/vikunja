import AbstractService from './abstractService'
import NamespaceModel from '../models/namespace'
import type {INamespace} from '@/modelTypes/INamespace'
import {formatISO} from 'date-fns'
import {colorFromHex} from '@/helpers/color/colorFromHex'

export default class NamespaceService extends AbstractService<INamespace> {
	constructor() {
		super({
			create: '/namespaces',
			get: '/namespaces/{id}',
			getAll: '/namespaces',
			update: '/namespaces/{id}',
			delete: '/namespaces/{id}',
		})
	}

	processModel(model) {
		model.created = formatISO(new Date(model.created))
		model.updated = formatISO(new Date(model.updated))
		return model
	}

	modelFactory(data) {
		return new NamespaceModel(data)
	}

	beforeUpdate(namespace) {
		namespace.hexColor = colorFromHex(namespace.hexColor)
		return namespace
	}

	beforeCreate(namespace) {
		namespace.hexColor = colorFromHex(namespace.hexColor)
		return namespace
	}
}