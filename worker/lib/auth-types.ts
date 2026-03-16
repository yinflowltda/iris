import type { IRequest } from 'itty-router'
import type { User } from '../../shared/types/User'

export interface AuthUser extends User {
	/** True when user was created via dev bypass, not real JWT */
	isDev: boolean
}

export interface AuthenticatedRequest extends IRequest {
	user: AuthUser
}
