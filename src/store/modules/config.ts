import type { ActionContext } from 'vuex'
import {parseURL} from 'ufo'

import {CONFIG} from '../mutation-types'
import {HTTPFactory} from '@/http-common'
import {objectToCamelCase} from '@/helpers/case'
import type { RootStoreState, ConfigState } from '@/store/types'

export default {
	namespaced: true,
	state: (): ConfigState => ({
		// These are the api defaults.
		version: '',
		frontendUrl: '',
		motd: '',
		linkSharingEnabled: true,
		maxFileSize: '20MB',
		registrationEnabled: true,
		availableMigrators: [],
		taskAttachmentsEnabled: true,
		totpEnabled: true,
		enabledBackgroundProviders: [],
		legal: {
			imprintUrl: '',
			privacyPolicyUrl: '',
		},
		caldavEnabled: false,
		userDeletionEnabled: true,
		taskCommentsEnabled: true,
		auth: {
			local: {
				enabled: true,
			},
			openidConnect: {
				enabled: false,
				redirectUrl: '',
				providers: [],
			},
		},
	}),
	getters: {
		migratorsEnabled: (state: ConfigState) => state.availableMigrators?.length > 0,
		apiBase() {
			const {host, protocol} = parseURL(window.API_URL)
			return protocol + '//' + host
		},
	},
	mutations: {
		[CONFIG](state: ConfigState, config: ConfigState) {
			Object.assign(state, config)
		},
	},
	actions: {
		async update(ctx: ActionContext<ConfigState, RootStoreState>) {
			const HTTP = HTTPFactory()
			const {data: config} = await HTTP.get('info')
			ctx.commit(CONFIG, objectToCamelCase(config))
			return config
		},
	},
}