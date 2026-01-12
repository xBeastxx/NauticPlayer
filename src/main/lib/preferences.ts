
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

const PREF_FILE = 'user-preferences.json'

interface UserPreferences {
  initialSetupComplete?: boolean
  [key: string]: any
}

function getPath(): string {
  return join(app.getPath('userData'), PREF_FILE)
}

export function getPreferences(): UserPreferences {
  try {
    const path = getPath()
    if (!existsSync(path)) return {}
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (e) {
    console.error('Failed to read preferences:', e)
    return {}
  }
}

export function getPreference<T>(key: keyof UserPreferences, defaultValue?: T): T | undefined {
  const prefs = getPreferences()
  return (prefs[key] as T) ?? defaultValue
}

export function savePreference(key: keyof UserPreferences, value: any): void {
  try {
    const prefs = getPreferences()
    prefs[key] = value
    writeFileSync(getPath(), JSON.stringify(prefs, null, 2))
  } catch (e) {
    console.error('Failed to save preferences:', e)
  }
}
