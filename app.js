const fetch = require('node-fetch');
const URL   = require('url');

require('dotenv').config()

const { RALLY_APIKEY, JIRA_USERNAME, JIRA_PASSWORD } = process.env

// --------------- jira ----------------------------------------------
const jiraApiPath = 'rest/api/2/issue';
const jiraAgilePath = 'rest/agile/1.0/epic';

let jiraURLs = {};
const jiraEndpoint = 'createmeta'

var jiraHeaders = {
    "Content-Type":"application/json",
    'Authorization': 'Basic ' + Buffer.from(JIRA_USERNAME + ":" + JIRA_PASSWORD).toString('base64')
}

let jiraCachedIssueInfo = {}
const jiraNewIssues = [];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const jiraUrlMaker = (jiraUrl, jiraProjectKey) => {
    return  {
        baseUrl: `${jiraUrl}/${jiraApiPath}`,
        epicLinkBaseUrl : `${jiraUrl}/${jiraAgilePath}`,
        projectKey: jiraProjectKey
    }
}

const jiraQueryURL = (issueType) => {
    //example: http://34.105.88.232:8080/rest/api/2/issue/createmeta?projectKey=FAN&issuetypeNames=Epic&expand=projects.issuetypes.fields
    let params = {projectKey: jiraURLs.projectKey, issuetypeNames: issueType, expand: 'projects.issuetypes.fields'}
    let url  = `${jiraURLs.baseUrl}/${jiraEndpoint}${URL.format({ query: params })}` 
    return url
}

const jiraSaveIssueInfo = async (issueType) => {
    let url = jiraQueryURL(issueType)
    if (!jiraCachedIssueInfo.hasOwnProperty(issueType)){
        //console.log('fetching from server')
        let response = await fetch(url, {headers: jiraHeaders})
        let data = await response.json()
        jiraCachedIssueInfo[issueType] = data["projects"][0]["issuetypes"][0]
    }else{
        //console.log('fetching from cache')
    }
    return jiraCachedIssueInfo[issueType]
}

const jiraPostPayload = async (issueType, name) => {
    let body = {} 
    await jiraSaveIssueInfo(issueType)
    let timestamp = Date.now()
    if (issueType == 'Story'){
        body = {"fields":{"project":{"key": jiraURLs.projectKey}, 
        "summary": `story ${name} - ${timestamp}`,
        "description": "via REST",
        "issuetype": {"name": "Story"}}}
    } else if(issueType == 'Epic'){
        //identify customfield_xxx object with key "name" which is set to "Epic Name" to use it in the payload
        let fields = jiraCachedIssueInfo[issueType]['fields']
        let keys = Object.keys(fields);
        let cfKeys = keys.filter(key => key.toLowerCase().includes("customfield_"));
        for (let val of cfKeys){
            if (fields[val]["name"] == 'Epic Name'){
                body = {"fields":{"project":{"key": jiraURLs.projectKey}, 
                         [val]: `epic ${timestamp}`,
                         "summary": `epic ${name} - ${timestamp}`,
                         "description": "via REST",
                         "issuetype": {"name": "Epic"}}}
            }
         }
    }
    return body
}

const jiraCreateIssue = async (body = {}) => {
    try{
        const response = await fetch(jiraURLs.baseUrl, {
            method: 'POST', 
            mode: 'cors', 
            cache: 'no-cache', 
            credentials: 'same-origin', 
            headers: jiraHeaders,
            body: JSON.stringify(body) 
          });
        return response.json(); 
    }catch(err){
      console.log(err)
    }
  }

  const jiraLinkStoriesToEpic = async (epicKey, storyKeys) => {
    // example: 
    //url: http://34.105.88.232:8080/rest/agile/1.0/epic/FOO-1049/issue
    //payload: { "issues": ["FOO-1003"]}
    try{
        let url = `${jiraURLs.epicLinkBaseUrl}/${epicKey}/issue`
        let data = {"issues": storyKeys}
        const response = await fetch(url, {
          method: 'POST', 
          mode: 'cors', 
          cache: 'no-cache', 
          credentials: 'same-origin', 
          headers: jiraHeaders,
          body: JSON.stringify(data)
        });
      return response.text(); 
    }catch(err) {
      console.log(err)
    }
}

const jiraBulkCreateIssues = async (count, name, linkToEpic=false) => {  
    console.log(`Creating ${count} stories...`)  
    try{
        for(let i = 0; i < count; i++){
            await new Promise(async next => {
                let body = await jiraPostPayload('Story', name);
                let story = await jiraCreateIssue(body);
                jiraNewIssues.push(story['key']);
                next()
            })
        }
        if (linkToEpic){
            console.log(`Creating an epic, linking ${count} stories to it...`)
            let epicKey = await jiraRequestBody('Epic').then(jiraCreateIssue).then(res => res['key']);
            await jiraLinkStoriesToEpic(epicKey, jiraNewIssues)
        }
    }catch (error) {
        console.log(error)
    }
}

// ---------------------- rally --------------------------------------------
const rallyApiPath = 'slm/webservice/v2.0';
var rallyHeaders = {
    "Content-Type":"application/json",
    'zsessionid': RALLY_APIKEY
}
let rally = {}

const rallyUrlMaker = (rallyUrl, rallyWorkspaceOid, rallyProjectOid) => {
    return  {
        baseUrl: `${rallyUrl}/${rallyApiPath}`,
        workspace: rallyWorkspaceOid,
        project: rallyProjectOid
    }
}

const rallyPostPayload = async (type) => {
    let timestamp = Date.now();
    let body = {[type]:{
        "workspace":`workspace/${rally.workspace}`,
        "project":`project/${rally.project}`, 
        "name": `${type}-foobar-${timestamp}`,
        "description": "description goes here"}
    }
    return body;
}
const rallyCreateWorkitem = async (body = {}) => {
    const createEndpoint = `${Object.keys(body)[0]}/create`
    try{
        const response = await fetch(`${rally.baseUrl}/${createEndpoint}`, {
            method: 'POST', 
            mode: 'cors', 
            cache: 'no-cache', 
            credentials: 'same-origin', 
            headers: rallyHeaders,
            body: JSON.stringify(body) 
          });
        return response.json(); 
    }catch(err){
      console.log(err)
    }
}


const rallyFindWorkItems = async (type, field, value) => {
    /* example of a query url
    * https://rally1.rallydev.com/slm/webservice/v2.0/hierarchicalrequirement?workspace=workspace/29047390143&project=/project/35973806807&query=(Name = "n story")
    */
    const endpoint = `${rally.baseUrl}/${type}?workspace=workspace/${rally.workspace}&project=project/${rally.project}`
    //const queryUrl = `${endpoint}&query=(${field} = "${value}")`;
    const queryUrl = `${endpoint}&query=(${field} contains "${value}")&pagesize=1000`;
    console.log(`queryUrl: ${queryUrl}`);
    try{
        const response = await fetch(`${queryUrl}`, {
            method: 'GET', 
            mode: 'cors', 
            cache: 'no-cache', 
            credentials: 'same-origin', 
            headers: rallyHeaders 
          });
        return response.json()
    }catch(err){
      console.log(err)
    }
}

const rallyUpdateItem = async (ref, type, field, value) => {
    console.log(`update item: ${ref} ...`)
    try{
        let body = {[type]:{[field]: value}}
        console.log(JSON.stringify(body))
        const response = await fetch(ref, {
            method: 'PUT', 
            mode: 'cors', 
            cache: 'no-cache', 
            credentials: 'same-origin', 
            headers: rallyHeaders,
            body: JSON.stringify(body)
          });
        return response.json(); 
    } catch(err){
        console.log(err);
    }
}

const rallyLinkStoriesToFeatures = async(type, field, value) =>{
    const rallyResponse = await rallyFindWorkItems(type, field, value);
    const stories = rallyResponse["QueryResult"]["Results"].map(result => result["_ref"]);
    let features = [];
    let featureCount = Math.round(stories.length/5);
    for(let i = 0; i < featureCount; i++){
        let payload = await rallyPostPayload('portfolioitem/feature');
        let feature = await rallyCreateWorkitem(payload);
        features.push(feature['CreateResult']['Object']['_ref'])
    }
    const groupsOfStories = stories.reduce((result, value, index, initialArr) => {
        if (index % 5 === 0)
          result.push(initialArr.slice(index, index + 5));
        return result;
      }, []);
      groupsOfStories.forEach((pair, i) => {
        pair.forEach(story => {
            rallyUpdateItem(story, 'hierarchicalrequirement', 'portfolioitem', features[i])
        })
    })
}

const argv = require('yargs')
    .command('jira-create', 'create stories in Jira', (yargs) => {
        yargs
           .positional('jiraUrl', { describe: 'Jira url'})
           .positional('jiraProjectKey', {describe: 'Jira project key'})
           .positional('count', {describe: 'how many stories to create',default: 10})
           .positional('name', {describe: 'Jira issue name'})
           .positional('epic', {describe: 'create epic, link to stories'})
    }, (argv) => {
        jiraURLs = jiraUrlMaker(argv.jiraUrl, argv.jiraProjectKey)
        jiraBulkCreateIssues(argv.count, argv.name, argv.epic)
    }).command('rally-link', 'find stories in Rally, create features, link them to stories', (yargs) => {
          yargs
              .positional('rallyUrl', {describe: 'Rally url'})
              .positional('rallyWorkspaceOid', {describe: 'Rally workspace ObjectID'})
              .positional('rallyProjectOid', {describe: 'Rally project ObjectID'})
              .positional('type', {describe: 'Rally workitem type'})
              .positional('field',{describe: 'field name to query, e.g. Name'})
              .positional('value',{describe: 'value of field to query, e.g. "Long story"'})
    }, (argv) => {
        rally = rallyUrlMaker(argv.rallyUrl,argv.rallyWorkspaceOid, argv.rallyProjectOid) 
        rallyLinkStoriesToFeatures( argv.type,argv.field,argv.value);
    })
    .argv;