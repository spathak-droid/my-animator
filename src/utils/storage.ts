import { del, get, set } from 'idb-keyval'
import type { AnimatorProject, FrameData } from '../types'

const PROJECT_KEY = 'flipaclip-project'

export const loadProject = async (): Promise<AnimatorProject | null> => {
  try {
    const saved = await get<AnimatorProject>(PROJECT_KEY)
    if (saved) {
      return saved
    }
  } catch (error) {
    console.error('Failed to load project', error)
  }
  return null
}

export const saveProject = async (project: AnimatorProject) => {
  try {
    await set(PROJECT_KEY, project)
  } catch (error) {
    console.error('Failed to save project', error)
  }
}

export const clearProject = async () => {
  try {
    await del(PROJECT_KEY)
  } catch (error) {
    console.error('Failed to clear project', error)
  }
}

export const updateFrame = async (
  project: AnimatorProject,
  frameId: string,
  updater: (frame: FrameData) => FrameData,
): Promise<AnimatorProject> => {
  const frames = project.frames.map((frame) =>
    frame.id === frameId ? updater(frame) : frame,
  )
  const updatedProject: AnimatorProject = {
    frames,
    updatedAt: Date.now(),
  }
  await saveProject(updatedProject)
  return updatedProject
}
