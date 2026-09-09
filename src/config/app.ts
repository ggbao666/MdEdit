import packageInfo from '../../package.json'

/** 应用显示名称的唯一来源是 package.json 的 productName。 */
export const APP_NAME = packageInfo.productName
export const APP_VERSION = packageInfo.version
export const APP_SLUG = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-')
