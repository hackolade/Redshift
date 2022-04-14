module.exports = {
	SMALLINT: {
		capacity: 2,
	},
	INTEGER: {
		capacity: 4,
	},
	BIGINT: {
		capacity: 8,
	},
	DECIMAL: {
		capacity: 32,
	},
	REAL: {
		capacity: 4,
	},
	'DOUBLE PRECISION': {
		capacity: 8,
		mode: 'floating',
	},
	BOOLEAN: {
		mode: 'boolean',
	},
	VARCHAR: {
		mode: 'varying',
	},
	CHAR: {
		size: 1,
	},
	DATE: {
		format: 'YYYY-MM-DD',
	},
	TIMESTAMP: {
		format: 'YYYY-MM-DD hh:mm:ss',
	},
	TIMESTAMPTZ: {
		format: 'YYYY-MM-DD hh:mm:ssof',
	},
	GEOMETRY: {
		format: 'spatial',
	},
	SUPER: {
		format: 'semi-structured',
	},
	TIME: {
		format: 'hh:mm:ss',
	},
	TIMETZ: {
		format: 'hh:mm:ssof',
	},
	VARBYTE: {},
};
