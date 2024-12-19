const _ = require('lodash');

const commentIfDeactivated = (statement, data, isPartOfLine) => {
	if (data.isActivated === false) {
		if (isPartOfLine) {
			return '/* ' + statement + ' */';
		} else if (statement.includes('\n')) {
			return '/*\n' + statement + ' */\n';
		} else {
			return '// ' + statement;
		}
	}
	return statement;
};

module.exports = {
	commentIfDeactivated,
};
