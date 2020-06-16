let AWS = require('aws-sdk');
let jmespath = require('jmespath');
let fs = require('fs');
let ini = require('node-ini');
let os = require('os');

function getProfileFromDisk(profile) {
    // Combine config and credentials into one object for easier dealing
    let credentials = ini.parseSync(`${os.homedir()}/.aws/credentials`);
    let config = ini.parseSync(`${os.homedir()}/.aws/config`);
    Object.keys(credentials).forEach(key => {
        if ((config[`profile ${key}`] && config[`profile ${key}`].region) || (config[`${key}`] && config[`${key}`].region)) {
            let profile = config[`profile ${key}`] || config[`${key}`];
            credentials[key].region = profile.region;
        } else {
            delete credentials[key];
        }
    });

    let combinedConfig = {};
    combinedConfig.region = credentials[profile].region;
    combinedConfig.accessKeyId = credentials[profile].aws_access_key_id;
    combinedConfig.secretAccessKey = credentials[profile].aws_secret_access_key;

    return combinedConfig;
}

async function init(config) {
    AWS.config = new AWS.Config(config);
    let taws = new Taws();
    await taws.loadData();
    return {
        refresh: taws.refresh,
        instances: {
            getAll: () => {
                return taws.data.instances;
            },
            findDeep: (searchString) => {
                return taws.findDeep(searchString, taws.data['instances']);
            },
            findJSMEPath: (jmesPath, dataSet) => {
                return taws.findJMESPath(jmesPath, dataSet || taws.data['instances']);
            }
        },
    };
}

function Taws() {
    this.data = {};

    this.loadData = () => {
        return new Promise((resolve, reject) => {
            try {
                this.data = JSON.parse(fs.readFileSync(tempFilePath).toString());
                resolve();
            } catch (e) {
                this.requestAWSData().then(() => {
                    resolve()
                });
            }
        })
    }

    this.requestAWSData = async () => {
        await Promise.all([
            new AWS.EC2().describeInstances().promise().then(result => {
                this.data.reservations = result.Reservations
            }),
            new AWS.AutoScaling().describeAutoScalingGroups().promise().then(result => {
                this.data.autoScalingGroups = result.AutoScalingGroups
            }),
            // new AWS.CostExplorer().getCostAndUsage({
            //     TimePeriod: {
            //         Start: '2020-05-01',
            //         End: '2020-06-01'
            //     },
            //     Granularity: 'DAILY',
            //     Metrics: ['BlendedCost', 'UnblendedCost', 'UsageQuantity']
            // }).promise().then(result => {
            //     this.costAndUsageData = result;
            // })

        ]);

        this.data.instances = [].concat(...Object.values(this.data.reservations).map(x => { // Unwraps everything into a flat array of instances
            return x.Instances
        }));

        // Add ASG info to instances
        this.data.instances = arrayToObject(this.data.instances, 'InstanceId');
        this.data.autoScalingGroups.forEach(asg => {
            if (asg.Instances.length > 0) {
                asg.Instances.forEach(instance => {
                    this.data.instances[instance.InstanceId].AutoScalingGroupName = asg.AutoScalingGroupName;
                });
            }
        });
        this.data.instances = Object.values(this.data.instances);

        if (tempFilePath)
            await fs.writeFileSync(tempFilePath, JSON.stringify(this.data, null, 2));
    };

    this.findDeep = (searchString, dataSet) => {
        if (!searchString)
            return dataSet;
        let results = [];
        dataSet.forEach(item => {
            if (find(item, searchString)) {
                results.push(item);
            }
        });
        return results;
    }

    this.findJMESPath = (jmesPathString, dataSet) => {
        // Examples
        // --------
        // aws.getInstancesJMESPath('[?InstanceType==\'c3.large\'] | [?KernelId==\'aki-8e5ea7e7\']')
        // aws.getInstancesJMESPath('[*].{InstanceId: InstanceId, ImageId: ImageId}')
        // aws.getInstancesJMESPath('[*].[InstanceId, ImageId]')
        // aws.getInstancesJMESPath('[*].{InstanceId: InstanceId, ImageId: ImageId}')
        // aws.getInstancesJMESPath('[*].{PrivateIpAddress: PrivateIpAddress, State: State.Name, VpcId: VpcId}')
        // aws.getInstancesJMESPath('[?length(BlockDeviceMappings) > \`9\`]') // numeric comparison
        // aws.getInstancesJMESPath('[?length(BlockDeviceMappings) == \`10\`]')
        //
        // Find the instance with a given volume ID using deep search (matches this string anywhere in the instance)
        // aws.getInstances('vol-0b74a5ce22313f862')
        //
        // For comparision - find _specifically_ the instance that's using this volume ID (matches it exactly where it should be)
        // aws.getInstancesJMESPath(`[?contains(BlockDeviceMappings[].Ebs.VolumeId, 'vol-0b74a5ce22313f862')]`)
        //
        // printTable(aws.findInstancesDeepThenJMESPath(target, '[*].{InstanceId: InstanceId, Name: Tags[?Key == \'Name\'].Value|[0], PrivateIpAddress: PrivateIpAddress}'));

        return jmespath.search(dataSet || this.data[dataSet], jmesPathString);
    }

    this.refresh = () => {
        return this.requestAWSData();
    }

}

function isPlainObject(o) {
    // return !Array.isArray(o) && typeof o !== 'number' && typeof o !== 'string' && typeof o !== 'boolean' && typeof o !== 'undefined';
    return o instanceof Object && !Array.isArray(o);
}

// Return an array
// The passed in array, or an array of object values, or wraps a string in a single count array
function asArray(o) {
    if (isPlainObject(o))
        return Object.values(o);
    if (Array.isArray(o))
        return o;
    if (typeof o === 'function')
        throw Error;
    return [o];
}

// Find a substring in a string, in an array, or in the values of an object - returns true if it's in there somewhere
// Note - recursive
function find(a, s, filter) {
    a = asArray(a);
    let values = a;
    for (let i = 0; i < values.length; i++) {
        if (Array.isArray(values[i])) {
            if (find(values[i], s))
                return true;
        }
        if (isPlainObject(values[i])) {
            if (find(values[i], s))
                return true;
        }
        if (typeof values[i] === 'number')
            values[i] = values[i].toString();
        if (typeof values[i] === 'string' && values[i].toLocaleLowerCase().includes(s.toLowerCase()))
            return true
    }
    return false;
}

const arrayToObject = (array, keyField) =>
    array.reduce((obj, item) => {
        obj[item[keyField]] = item
        return obj
    }, {})

let tempFilePath;

function useTempFile(filePath) {
    tempFilePath = filePath;
}

module.exports = {
    init: init,
    useTempFile: useTempFile,
    getProfileFromDisk: getProfileFromDisk
};
