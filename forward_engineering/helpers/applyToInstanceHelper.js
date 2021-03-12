const redshiftHelper = require('../../reverse_engineering/helpers/redshiftHelper');

module.exports = { 
    async applyToInstance (connectionInfo, logger){
        const script = connectionInfo.script;
        await redshiftHelper.connect(connectionInfo,logger);

        logger.log('info', {
            message: 'Applying redshift script has been started'
        }, 'Redshift script');	

        await redshiftHelper.executeApplyToInstanceScript(script)
    },

    async testConnection(connectionInfo,logger){
        await redshiftHelper.testConnection(connectionInfo,logger)
    }
}