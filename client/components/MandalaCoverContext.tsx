import { createContext, useContext } from 'react'

export interface MandalaCoverActions {
	onCoverSlideClick: (slideText: string) => void
}

export const MandalaCoverContext = createContext<MandalaCoverActions>({
	onCoverSlideClick: () => {},
})

export function useMandalaCoverActions(): MandalaCoverActions {
	return useContext(MandalaCoverContext)
}
