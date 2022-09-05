import type { Module } from 'vuex'

import {HTTPFactory, AuthenticatedHTTPFactory} from '@/http-common'
import {i18n, getCurrentLanguage, saveLanguage} from '@/i18n'
import {objectToSnakeCase} from '@/helpers/case'
import {LOADING} from '../mutation-types'
import UserModel from '@/models/user'
import UserSettingsService from '@/services/userSettings'
import {getToken, refreshToken, removeToken, saveToken} from '@/helpers/auth'
import {setLoading} from '@/store/helper'
import {success} from '@/message'
import {redirectToProvider} from '@/helpers/redirectToProvider'
import type { RootStoreState, AuthState, Info} from '@/store/types'
import {AUTH_TYPES} from '@/store/types'
import type { IUserSettings } from '@/models/userSettings'


const defaultSettings = settings => {
	if (typeof settings.weekStart === 'undefined' || settings.weekStart === '') {
		settings.weekStart = 0
	}
	return settings
}

const authStore : Module<AuthState, RootStoreState> =  {
	namespaced: true,
	state: () => ({
		authenticated: false,
		isLinkShareAuth: false,
		info: null,
		needsTotpPasscode: false,
		avatarUrl: '',
		lastUserInfoRefresh: null,
		settings: {}, // should be IUserSettings
	}),
	getters: {
		authUser(state) {
			return state.authenticated && (
				state.info &&
				state.info.type === AUTH_TYPES.USER
			)
		},
		authLinkShare(state) {
			return state.authenticated && (
				state.info &&
				state.info.type === AUTH_TYPES.LINK_SHARE
			)
		},
	},
	mutations: {
		info(state, info: Info) {
			state.info = info
			if (info !== null) {
				state.avatarUrl = info.getAvatarUrl()

				if (info.settings) {
					state.settings = defaultSettings(info.settings)
				}

				state.isLinkShareAuth = info.id < 0
			}
		},
		setUserSettings(state, settings: IUserSettings) {
			state.settings = defaultSettings(settings)
			const info = state.info !== null ? state.info : {} as Info
			info.name = settings.name
			state.info = info
		},
		authenticated(state, authenticated: boolean) {
			state.authenticated = authenticated
		},
		isLinkShareAuth(state, isLinkShareAuth: boolean) {
			state.isLinkShareAuth = isLinkShareAuth
		},
		needsTotpPasscode(state, needsTotpPasscode: boolean) {
			state.needsTotpPasscode = needsTotpPasscode
		},
		reloadAvatar(state) {
			if (!state.info) return
			state.avatarUrl = `${state.info.getAvatarUrl()}&=${+new Date()}`
		},
		lastUserRefresh(state) {
			state.lastUserInfoRefresh = new Date()
		},
	},
	actions: {
		// Logs a user in with a set of credentials.
		async login(ctx, credentials) {
			const HTTP = HTTPFactory()
			ctx.commit(LOADING, true, {root: true})

			// Delete an eventually preexisting old token
			removeToken()

			try {
				const response = await HTTP.post('login', objectToSnakeCase(credentials))
				// Save the token to local storage for later use
				saveToken(response.data.token, true)

				// Tell others the user is autheticated
				ctx.dispatch('checkAuth')
			} catch (e) {
				if (
					e.response &&
					e.response.data.code === 1017 &&
					!credentials.totpPasscode
				) {
					ctx.commit('needsTotpPasscode', true)
				}

				throw e
			} finally {
				ctx.commit(LOADING, false, {root: true})
			}
		},

		// Registers a new user and logs them in.
		// Not sure if this is the right place to put the logic in, maybe a seperate js component would be better suited.
		async register(ctx, credentials) {
			const HTTP = HTTPFactory()
			ctx.commit(LOADING, true, {root: true})
			try {
				await HTTP.post('register', credentials)
				return ctx.dispatch('login', credentials)
			} catch (e) {
				if (e.response?.data?.message) {
					throw e.response.data
				}

				throw e
			} finally {
				ctx.commit(LOADING, false, {root: true})
			}
		},

		async openIdAuth(ctx, {provider, code}) {
			const HTTP = HTTPFactory()
			ctx.commit(LOADING, true, {root: true})

			const data = {
				code: code,
			}

			// Delete an eventually preexisting old token
			removeToken()
			try {
				const response = await HTTP.post(`/auth/openid/${provider}/callback`, data)
				// Save the token to local storage for later use
				saveToken(response.data.token, true)

				// Tell others the user is autheticated
				ctx.dispatch('checkAuth')
			} finally {
				ctx.commit(LOADING, false, {root: true})
			}
		},

		async linkShareAuth(ctx, {hash, password}) {
			const HTTP = HTTPFactory()
			const response = await HTTP.post('/shares/' + hash + '/auth', {
				password: password,
			})
			saveToken(response.data.token, false)
			ctx.dispatch('checkAuth')
			return response.data
		},

		// Populates user information from jwt token saved in local storage in store
		checkAuth(ctx) {

			// This function can be called from multiple places at the same time and shortly after one another.
			// To prevent hitting the api too frequently or race conditions, we check at most once per minute.
			if (ctx.state.lastUserInfoRefresh !== null && ctx.state.lastUserInfoRefresh > (new Date()).setMinutes((new Date()).getMinutes() + 1)) {
				return
			}

			const jwt = getToken()
			let authenticated = false
			if (jwt) {
				const base64 = jwt
					.split('.')[1]
					.replace('-', '+')
					.replace('_', '/')
				const info = new UserModel(JSON.parse(atob(base64)))
				const ts = Math.round((new Date()).getTime() / 1000)
				authenticated = info.exp >= ts
				ctx.commit('info', info)

				if (authenticated) {
					ctx.dispatch('refreshUserInfo')
				}
			}

			ctx.commit('authenticated', authenticated)
			if (!authenticated) {
				ctx.commit('info', null)
				ctx.dispatch('redirectToProviderIfNothingElseIsEnabled')
			}
		},

		redirectToProviderIfNothingElseIsEnabled({rootState}) {
			const {auth} = rootState.config
			if (
				auth.local.enabled === false &&
				auth.openidConnect.enabled &&
				auth.openidConnect.providers?.length === 1 &&
				window.location.pathname.startsWith('/login') // Kinda hacky, but prevents an endless loop.
			) {
				redirectToProvider(auth.openidConnect.providers[0], auth.openidConnect.redirectUrl)
			}
		},

		async refreshUserInfo({state, commit, dispatch}) {
			const jwt = getToken()
			if (!jwt) {
				return
			}

			const HTTP = AuthenticatedHTTPFactory()
			try {
				const response = await HTTP.get('user')
				const info = new UserModel(response.data)
				info.type = state.info.type
				info.email = state.info.email
				info.exp = state.info.exp

				commit('info', info)
				commit('lastUserRefresh')

				if (typeof info.settings.language === 'undefined' || info.settings.language === '') {
					// save current language
					await dispatch('saveUserSettings', {
						settings: {
							...state.settings,
							language: getCurrentLanguage(),
						},
						showMessage: false,
					})
				}

				return info
			} catch (e) {
				throw new Error('Error while refreshing user info:', {cause: e})
			}
		},

		async saveUserSettings(ctx, payload) {
			const {settings} = payload
			const showMessage = payload.showMessage ?? true
			const userSettingsService = new UserSettingsService()

			const cancel = setLoading(ctx, 'general-settings')
			try {
				saveLanguage(settings.language)
				await userSettingsService.update(settings)
				ctx.commit('setUserSettings', {...settings})
				if (showMessage) {
					success({message: i18n.global.t('user.settings.general.savedSuccess')})
				}
			} catch (e) {
				throw new Error('Error while saving user settings:', {cause: e})
			} finally {
				cancel()
			}
		},

		// Renews the api token and saves it to local storage
		renewToken(ctx) {
			// FIXME: Timeout to avoid race conditions when authenticated as a user (=auth token in localStorage) and as a
			// link share in another tab. Without the timeout both the token renew and link share auth are executed at
			// the same time and one might win over the other.
			setTimeout(async () => {
				if (!ctx.state.authenticated) {
					return
				}

				try {
					await refreshToken(!ctx.state.isLinkShareAuth)
					ctx.dispatch('checkAuth')
				} catch (e) {
					// Don't logout on network errors as the user would then get logged out if they don't have
					// internet for a short period of time - such as when the laptop is still reconnecting
					if (e?.request?.status) {
						ctx.dispatch('logout')
					}
				}
			}, 5000)
		},
		logout(ctx) {
			removeToken()
			window.localStorage.clear() // Clear all settings and history we might have saved in local storage.
			ctx.dispatch('checkAuth')
		},
	},
}

export default authStore