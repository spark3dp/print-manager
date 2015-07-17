var ErrorFactory = require('./ErrorFactory.js');

/**
	A class to wrap common errors that can be used from API's
*/
module.exports = {
	General: {
		DatabaseError: ErrorFactory('DatabaseError', 'error', 500, true),
		FileNotFoundError: ErrorFactory('FileNotFoundError', 'error', 500, true),
		OperationError: ErrorFactory('OperationError', 'error', 500, true)
	},
	Request: {
		BadRequestError: ErrorFactory('BadRequestError', 'warning', 400),
		UnauthorizedError: ErrorFactory('UnauthorizedError', 'warning', 401),
		NotFoundError: ErrorFactory('NotFoundError', 'warning', 404),
		ForbiddenError: ErrorFactory('ForbiddenError', 'warning', 403),
		ResourceNotFoundError: ErrorFactory('ResourceNotFoundError', 'warning', 400),
		ServerError: ErrorFactory('ServerError', 'error', 500, true),
		HttpError: ErrorFactory('HttpError', 'error', 500, true)
	},
	AWS : {
		S3FileNotFoundError : ErrorFactory('S3FileNotFoundError', 'error', 500)
	},
	Factory: ErrorFactory
};