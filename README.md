# rally-jira-util

The purpose of this script is to attempt to replicate a WS API concurrency error. 

## pre-requisite
Configure LAC to map a Jira project to Rally workspace/project. `JiraProjectKey` Rally custom field must exist on a Rally project and its value must match Jira project key.

## installation

`git clone https://github.com/nmusaelian-rally/rally-jira-util.git && cd jira-inator && npm i`

Jira credentials are read from `.env` file in the root directory. Create `.env` file, for example:
```
JIRA_PASSWORD="Password"
JIRA_USERNAME="test"
RALLY_APIKEY=_abc123
```

## two-step intended scenario and usage
1. Use `jira-create` command to bulk create stories in Jira. (The adapter copies those stories to Rally.) 
1. Use `rally-link` command to query Rally to find stories copied from Jira and create features, and link them to stories. The ratio of features to stories is currently hardcoded to 5. (The adapter copies creates epics in Jira and links them to stories)

`jira create` command creates stories in Jira with summary that follows this pattern: 
`story name - timestamp`.
Rally query uses `contains` operator to match Story summary specified in `jira-create` command's `name` argument to the name of Hierarchical Requirement specified in `rally-link` command's `value` argument. 
```
% node app.js --help
app.js [command]

Commands:
  app.js jira-create  create stories in Jira
  app.js rally-link   find stories in Rally, create features, link them to stories

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]
```
Details of `jira-create` command:

```
% node app.js jira-create  --help                                                                                            
app.js jira-create

create stories in Jira

Positionals:
  jiraUrl         Jira url
  jiraProjectKey  Jira project key
  count           how many stories to create                       [default: 10]
  name            Jira issue name
  epic            create epic, link to stories
```
An example of `jira-create` command:

```
% node app.js jira-create  --jiraUrl='https://jira-name.testn.f4tech.com' --jiraProjectKey='SP' --count=1000 --name='fantomas'
```
Details of `rally-link` command:
```
% node app.js rally-link --help
app.js rally-link

find stories in Rally, create features, link them to stories

Positionals:
  rallyUrl           Rally url
  rallyWorkspaceOid  Rally workspace ObjectID
  rallyProjectOid    Rally project ObjectID
  type               Rally workitem type
  field              field name to query, e.g. Name
  value              value of field to query, e.g. "Long story"
```

An example of `rally-link` command:
```
% node app.js rally-link  --rallyUrl='https://rally1.rallydev.com' --rallyWorkspaceOid=12345--rallyProjectOid=678910 --type=hierarchicalrequirement --field=name --value='fantomas'

```