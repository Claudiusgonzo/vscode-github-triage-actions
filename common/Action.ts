/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OctoKit, OctoKitIssue, getNumRequests } from '../api/octokit'
import { context, GitHub } from '@actions/github'
import { getRequiredInput, logErrorToIssue, getRateLimit } from './utils'
import { getInput, setFailed } from '@actions/core'
import * as appInsights from 'applicationinsights'

console.log('m')

let aiHandle: appInsights.TelemetryClient | undefined = undefined
const aiKey = getInput('appInsightsKey')
if (aiKey) {
	appInsights
		.setup(aiKey)
		.setAutoDependencyCorrelation(false)
		.setAutoCollectRequests(false)
		.setAutoCollectPerformance(false, false)
		.setAutoCollectExceptions(false)
		.setAutoCollectDependencies(false)
		.setAutoCollectConsole(false)
		.setUseDiskRetryCaching(false)
		.start()
	aiHandle = appInsights.defaultClient
}

export abstract class Action {
	abstract id: string

	private username: Promise<string>
	private token = getRequiredInput('token')

	constructor() {
		this.username = new GitHub(this.token).users.getAuthenticated().then((v) => v.data.name)
	}

	public async trackMetric(telemetry: { name: string; value: number }) {
		console.log('tracking metric:', telemetry)
		if (aiHandle) {
			aiHandle.trackMetric({
				...telemetry,
				properties: {
					repo: `${context.repo.owner}/${context.repo.repo}`,
					id: this.id,
					user: await this.username,
				},
			})
		}
	}

	public async run() {
		console.log('f')
		try {
			const token = getRequiredInput('token')
			const readonly = !!getInput('readonly')

			const issue = context?.issue?.number
			console.log('g')

			if (issue) {
				console.log('h')
				const octokit = new OctoKitIssue(token, context.repo, { number: issue }, { readonly })
				if (context.eventName === 'issue_comment') {
					await this.onCommented(octokit, context.payload.comment.body, context.actor)
				} else if (context.eventName === 'issue') {
					switch (context.payload.action) {
						case 'opened':
							await this.onOpened(octokit)
							break
						case 'reopened':
							await this.onReopened(octokit)
							break
						case 'closed':
							await this.onClosed(octokit)
							break
						case 'labeled':
							await this.onLabeled(octokit, context.payload.label.name)
							break
						case 'edited':
							await this.onEdited(octokit)
							break
						case 'milestoned':
							await this.onMilestoned(octokit)
							break
						default:
							throw Error('Unexpected action: ' + context.payload.action)
					}
				}
			} else {
				await this.onTriggered(new OctoKit(token, context.repo, { readonly }))
			}
		} catch (e) {
			console.log('i')
			await this.error(e)
		}

		await this.trackMetric({ name: 'octokit_request_count', value: getNumRequests() })

		const usage = await getRateLimit(this.token)
		await this.trackMetric({ name: 'usage_core', value: usage.core })
		await this.trackMetric({ name: 'usage_graphql', value: usage.graphql })
		await this.trackMetric({ name: 'usage_search', value: usage.search })
	}

	private async error(message: string) {
		console.log('j')

		const details: any = {
			message,
			repo: `${context.repo.owner}/${context.repo.repo}`,
			id: this.id,
			user: await this.username,
		}

		if (context.issue.number) details.issue = context.issue.number

		const token = getInput('token')
		const rendered = JSON.stringify(details, null, 2)
		if (token) {
			await logErrorToIssue(rendered, false, token)
		}
		setFailed(message)
	}

	protected async onTriggered(_octokit: OctoKit): Promise<void> {
		throw Error('not implemented')
	}
	protected async onEdited(_issue: OctoKitIssue): Promise<void> {
		throw Error('not implemented')
	}
	protected async onLabeled(_issue: OctoKitIssue, _label: string): Promise<void> {
		throw Error('not implemented')
	}
	protected async onOpened(_issue: OctoKitIssue): Promise<void> {
		throw Error('not implemented')
	}
	protected async onReopened(_issue: OctoKitIssue): Promise<void> {
		throw Error('not implemented')
	}
	protected async onClosed(_issue: OctoKitIssue): Promise<void> {
		throw Error('not implemented')
	}
	protected async onMilestoned(_issue: OctoKitIssue): Promise<void> {
		throw Error('not implemented')
	}
	protected async onCommented(_issue: OctoKitIssue, _comment: string, _actor: string): Promise<void> {
		throw Error('not implemented')
	}
}