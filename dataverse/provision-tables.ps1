<#
.SYNOPSIS
    Provisions InfraWatch AI Dataverse tables via the Web API.
.DESCRIPTION
    Creates publisher, solution, and 5 custom tables with all columns.
    Requires Azure CLI login to Community-Essentials tenant.
.EXAMPLE
    .\dataverse\provision-tables.ps1
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$OrgUrl,
    [string]$PublisherPrefix = "iw",
    [string]$PublisherName = "infrawatch",
    [string]$SolutionName = "InfraWatchAI"
)

$ErrorActionPreference = "Stop"
$apiUrl = "$OrgUrl/api/data/v9.2"
$amp = [char]38
$created = 0; $skipped = 0; $failed = 0

Write-Host "`n=== Getting access token ===" -ForegroundColor Cyan
$tokenJson = az account get-access-token --resource $OrgUrl 2>$null
$tokenObj = $tokenJson | ConvertFrom-Json
$token = $tokenObj.accessToken

if (-not $token) {
    Write-Error "Failed to get access token. Run 'az login' first."
    exit 1
}
Write-Host "  Token acquired (expires: $($tokenObj.expiresOn))" -ForegroundColor Green

$baseHeaders = @{
    "Authorization"    = "Bearer $token"
    "Content-Type"     = "application/json; charset=utf-8"
    "OData-MaxVersion" = "4.0"
    "OData-Version"    = "4.0"
    "Accept"           = "application/json"
}

function New-Label([string]$Text) {
    @{
        "@odata.type"     = "Microsoft.Dynamics.CRM.Label"
        "LocalizedLabels" = @(@{
                "@odata.type"  = "Microsoft.Dynamics.CRM.LocalizedLabel"
                "Label"        = $Text
                "LanguageCode" = 1033
            })
    }
}

function Invoke-Dv {
    param([string]$Method, [string]$Uri, [object]$Body, [hashtable]$ExtraHeaders = @{})
    $allHeaders = $baseHeaders.Clone()
    foreach ($k in $ExtraHeaders.Keys) { $allHeaders[$k] = $ExtraHeaders[$k] }
    $params = @{ Method = $Method; Uri = $Uri; Headers = $allHeaders; ErrorAction = "Stop" }
    if ($Body) {
        $json = $Body | ConvertTo-Json -Depth 30 -Compress
        $params.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
    }
    try {
        $resp = Invoke-RestMethod @params
        return @{ OK = $true; Data = $resp }
    }
    catch {
        $msg = $_.Exception.Message; $detail = ""
        try { if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $detail = $_.ErrorDetails.Message } } catch {}
        return @{ OK = $false; Error = $msg; Detail = $detail }
    }
}

$solHeader = @{ "MSCRM.SolutionUniqueName" = $SolutionName }

# === PUBLISHER ===
Write-Host "`n=== Step 1: Publisher ===" -ForegroundColor Cyan
$pubUrl = "${apiUrl}/publishers?" + "`$filter=uniquename eq '${PublisherName}'" + $amp + "`$select=publisherid"
$pubCheck = Invoke-Dv GET $pubUrl
if ($pubCheck.OK -and $pubCheck.Data.value.Count -gt 0) {
    $publisherId = $pubCheck.Data.value[0].publisherid
    Write-Host "  Already exists (ID: $publisherId)" -ForegroundColor Yellow
}
else {
    $pub = @{
        uniquename = $PublisherName; friendlyname = "InfraWatch AI"
        customizationprefix = $PublisherPrefix; customizationoptionvalueprefix = 88820
        description = "InfraWatch AI - Infrastructure Intelligence Platform"
    }
    $r = Invoke-Dv POST "$apiUrl/publishers" $pub
    if ($r.OK) {
        $pubUrl2 = "${apiUrl}/publishers?" + "`$filter=uniquename eq '${PublisherName}'" + $amp + "`$select=publisherid"
        $pubCheck2 = Invoke-Dv GET $pubUrl2
        $publisherId = $pubCheck2.Data.value[0].publisherid
        Write-Host "  Created (ID: $publisherId)" -ForegroundColor Green
    }
    else { Write-Error "Failed: $($r.Error)`n$($r.Detail)" }
}

# === SOLUTION ===
Write-Host "`n=== Step 2: Solution ===" -ForegroundColor Cyan
$solUrl = "${apiUrl}/solutions?" + "`$filter=uniquename eq '${SolutionName}'" + $amp + "`$select=solutionid"
$solCheck = Invoke-Dv GET $solUrl
if ($solCheck.OK -and $solCheck.Data.value.Count -gt 0) {
    Write-Host "  Already exists" -ForegroundColor Yellow
}
else {
    $sol = @{
        uniquename = $SolutionName; friendlyname = "InfraWatch AI"; version = "1.0.0.0"
        "publisherid@odata.bind" = "/publishers($publisherId)"
        description = "AI-powered infrastructure management"
    }
    $r = Invoke-Dv POST "$apiUrl/solutions" $sol
    if ($r.OK) { Write-Host "  Created" -ForegroundColor Green }
    else { Write-Error "Failed: $($r.Error)`n$($r.Detail)" }
}

# === COLUMN BUILDERS ===
function Col-String([string]$S, [string]$D, [int]$M = 200, [string]$R = "None", [string]$Dc = "") {
    $c = @{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = $S; DisplayName = (New-Label $D); RequiredLevel = @{Value = $R; CanBeChanged = $true }; MaxLength = $M; FormatName = @{Value = "Text" } }
    if ($Dc) { $c["Description"] = (New-Label $Dc) }; $c
}
function Col-Memo([string]$S, [string]$D, [int]$M = 5000, [string]$R = "None", [string]$Dc = "") {
    $c = @{ "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName = $S; DisplayName = (New-Label $D); RequiredLevel = @{Value = $R; CanBeChanged = $true }; MaxLength = $M; Format = "Text" }
    if ($Dc) { $c["Description"] = (New-Label $Dc) }; $c
}
function Col-Float([string]$S, [string]$D, [double]$Min = -100000000, [double]$Max = 100000000, [int]$P = 2, [string]$R = "None", [string]$Dc = "") {
    $c = @{ "@odata.type" = "Microsoft.Dynamics.CRM.DoubleAttributeMetadata"; SchemaName = $S; DisplayName = (New-Label $D); RequiredLevel = @{Value = $R; CanBeChanged = $true }; MinValue = $Min; MaxValue = $Max; Precision = $P }
    if ($Dc) { $c["Description"] = (New-Label $Dc) }; $c
}
function Col-Int([string]$S, [string]$D, [int]$Min = 0, [int]$Max = 2147483647, [string]$R = "None", [string]$Dc = "") {
    $c = @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = $S; DisplayName = (New-Label $D); RequiredLevel = @{Value = $R; CanBeChanged = $true }; MinValue = $Min; MaxValue = $Max; Format = "None" }
    if ($Dc) { $c["Description"] = (New-Label $Dc) }; $c
}
function Col-Bool([string]$S, [string]$D, [bool]$Def = $false, [string]$R = "None", [string]$Dc = "") {
    $c = @{ "@odata.type" = "Microsoft.Dynamics.CRM.BooleanAttributeMetadata"; SchemaName = $S; DisplayName = (New-Label $D); RequiredLevel = @{Value = $R; CanBeChanged = $true }; DefaultValue = $Def
        OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata"; TrueOption = @{Value = 1; Label = (New-Label "Yes") }; FalseOption = @{Value = 0; Label = (New-Label "No") } } 
    }
    if ($Dc) { $c["Description"] = (New-Label $Dc) }; $c
}
function Col-DateTime([string]$S, [string]$D, [string]$R = "None", [string]$Dc = "") {
    $c = @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = $S; DisplayName = (New-Label $D); RequiredLevel = @{Value = $R; CanBeChanged = $true }; Format = "DateAndTime"; DateTimeBehavior = @{Value = "UserLocal" } }
    if ($Dc) { $c["Description"] = (New-Label $Dc) }; $c
}
function Col-Money([string]$S, [string]$D, [string]$R = "None", [string]$Dc = "") {
    $c = @{ "@odata.type" = "Microsoft.Dynamics.CRM.MoneyAttributeMetadata"; SchemaName = $S; DisplayName = (New-Label $D); RequiredLevel = @{Value = $R; CanBeChanged = $true }; PrecisionSource = 2 }
    if ($Dc) { $c["Description"] = (New-Label $Dc) }; $c
}
function Col-Choice([string]$S, [string]$D, [array]$Opts, [string]$R = "None", [string]$Dc = "") {
    $os = @(); foreach ($o in $Opts) { $os += @{Value = $o.Value; Label = (New-Label $o.Label) } }
    $c = @{ "@odata.type" = "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"; SchemaName = $S; DisplayName = (New-Label $D); RequiredLevel = @{Value = $R; CanBeChanged = $true }
        OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $os } 
    }
    if ($Dc) { $c["Description"] = (New-Label $Dc) }; $c
}

# === CREATE TABLE FUNCTION ===
function New-DvTable {
    param([string]$SchemaName, [string]$DisplayName, [string]$PluralName, [string]$Description,
        [string]$PrimaryColSchema, [string]$PrimaryColDisplay, [int]$PrimaryColMaxLen = 200, [string]$PrimaryColDesc = "", [array]$Columns)
    $logicalName = $SchemaName.ToLower()
    Write-Host "`n--- Table: $SchemaName ---" -ForegroundColor Magenta
    $entUrl = "${apiUrl}/EntityDefinitions?" + "`$filter=LogicalName eq '${logicalName}'" + $amp + "`$select=LogicalName"
    $check = Invoke-Dv GET $entUrl
    if ($check.OK -and $check.Data.value.Count -gt 0) {
        Write-Host "  Already exists - checking columns" -ForegroundColor Yellow
    }
    else {
        $entity = @{
            "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"; SchemaName = $SchemaName
            DisplayName = (New-Label $DisplayName); DisplayCollectionName = (New-Label $PluralName); Description = (New-Label $Description)
            OwnershipType = "UserOwned"; HasActivities = $false; HasNotes = $true; IsActivity = $false
            PrimaryNameAttribute = $PrimaryColSchema.ToLower()
            Attributes = @(@{
                    "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = $PrimaryColSchema
                    DisplayName = (New-Label $PrimaryColDisplay); Description = (New-Label $(if ($PrimaryColDesc) { $PrimaryColDesc }else { "Primary name" }))
                    RequiredLevel = @{Value = "ApplicationRequired"; CanBeChanged = $true }; MaxLength = $PrimaryColMaxLen; IsPrimaryName = $true; FormatName = @{Value = "Text" }
                })
        }
        Write-Host "  Creating..." -NoNewline
        $r = Invoke-Dv POST "$apiUrl/EntityDefinitions" $entity $solHeader
        if (-not $r.OK) { Write-Host " FAILED: $($r.Error)" -ForegroundColor Red; if ($r.Detail) { Write-Host "  $($r.Detail)" -ForegroundColor DarkRed }; $script:failed++; return }
        Write-Host " OK" -ForegroundColor Green; $script:created++
    }
    $attrUrl = "$apiUrl/EntityDefinitions(LogicalName='$logicalName')/Attributes"
    foreach ($col in $Columns) {
        $colLogical = $col.SchemaName.ToLower()
        $colUrl = "${attrUrl}?" + "`$filter=LogicalName eq '${colLogical}'" + $amp + "`$select=LogicalName"
        $cc = Invoke-Dv GET $colUrl
        if ($cc.OK -and $cc.Data.value.Count -gt 0) { Write-Host "    $colLogical exists" -ForegroundColor DarkYellow; $script:skipped++; continue }
        Write-Host "    $($col.SchemaName)..." -NoNewline
        $cr = Invoke-Dv POST $attrUrl $col $solHeader
        if ($cr.OK) { Write-Host " OK" -ForegroundColor Green; $script:created++ }
        else {
            Write-Host " FAILED" -ForegroundColor Red
            if ($cr.Detail) { try { $d = ($cr.Detail | ConvertFrom-Json).error.message; Write-Host "      $d" -ForegroundColor DarkRed }catch { Write-Host "      $($cr.Detail.Substring(0,[Math]::Min(200,$cr.Detail.Length)))" -ForegroundColor DarkRed } }
            $script:failed++
        }
    }
}

# ============================================================
#  3. TABLE DEFINITIONS  (Precision 5 max for Float/Double)
# ============================================================
Write-Host "`n=== Step 3: Creating Tables ===" -ForegroundColor Cyan

# TABLE 1: Crew Dispatch
New-DvTable -SchemaName "iw_CrewDispatch" -DisplayName "Crew Dispatch" -PluralName "Crew Dispatches" `
    -Description "AI-generated crew dispatch assignments with approval workflow" `
    -PrimaryColSchema "iw_Name" -PrimaryColDisplay "Dispatch Name" -PrimaryColMaxLen 200 -PrimaryColDesc "Auto-generated dispatch ID" `
    -Columns @(
    (Col-String "iw_WorkOrderId" "Work Order ID" 100 "ApplicationRequired" "MCP work order reference"),
    (Col-String "iw_CrewId" "Crew ID" 100 "ApplicationRequired"),
    (Col-String "iw_CrewName" "Crew Name" 200),
    (Col-Choice "iw_Status" "Status" @(@{Value = 100000000; Label = "Draft" }, @{Value = 100000001; Label = "Pending Approval" }, @{Value = 100000002; Label = "Approved" }, @{Value = 100000003; Label = "Dispatched" }, @{Value = 100000004; Label = "In Progress" }, @{Value = 100000005; Label = "Completed" }, @{Value = 100000006; Label = "Cancelled" }, @{Value = 100000007; Label = "Rejected" }) "ApplicationRequired"),
    (Col-Choice "iw_Priority" "Priority" @(@{Value = 100000000; Label = "Critical" }, @{Value = 100000001; Label = "High" }, @{Value = 100000002; Label = "Medium" }, @{Value = 100000003; Label = "Low" }) "ApplicationRequired"),
    (Col-Choice "iw_IssueType" "Issue Type" @(@{Value = 100000000; Label = "Pothole" }, @{Value = 100000001; Label = "Sidewalk" }, @{Value = 100000002; Label = "Concrete" }) "ApplicationRequired"),
    (Col-String "iw_Address" "Address" 500),
    (Col-Float "iw_Latitude" "Latitude" -90 90 5),
    (Col-Float "iw_Longitude" "Longitude" -180 180 5),
    (Col-Float "iw_EstimatedDuration" "Estimated Duration (hours)" 0 10000 2 "None" "AI-estimated repair time"),
    (Col-Float "iw_ActualDuration" "Actual Duration (hours)" 0 10000 2),
    (Col-Money "iw_EstimatedCost" "Estimated Cost"),
    (Col-Money "iw_ActualCost" "Actual Cost"),
    (Col-Float "iw_AIConfidence" "AI Confidence Score" 0 1 4 "None" "0-1 confidence score"),
    (Col-Memo "iw_AIReasoning" "AI Reasoning" 10000 "None" "JSON reasoning steps"),
    (Col-String "iw_ApprovedBy" "Approved By" 200),
    (Col-DateTime "iw_ApprovedOn" "Approved On"),
    (Col-DateTime "iw_DispatchedAt" "Dispatched At"),
    (Col-DateTime "iw_CompletedAt" "Completed At"),
    (Col-Memo "iw_Notes" "Notes" 5000),
    (Col-String "iw_WeatherAtDispatch" "Weather at Dispatch" 200),
    (Col-Bool "iw_NearSchool" "Near School"),
    (Col-String "iw_Zone" "Zone" 50)
)

# TABLE 2: Field Inspection
New-DvTable -SchemaName "iw_FieldInspection" -DisplayName "Field Inspection" -PluralName "Field Inspections" `
    -Description "On-site condition reports from field crews" `
    -PrimaryColSchema "iw_Name" -PrimaryColDisplay "Inspection Name" -PrimaryColMaxLen 200 -PrimaryColDesc "Auto-generated inspection ID" `
    -Columns @(
    (Col-String "iw_DispatchId" "Dispatch ID" 100 "ApplicationRequired" "Link to dispatch"),
    (Col-String "iw_WorkOrderId" "Work Order ID" 100 "ApplicationRequired"),
    (Col-String "iw_InspectorName" "Inspector Name" 200 "ApplicationRequired"),
    (Col-Choice "iw_InspectionType" "Inspection Type" @(@{Value = 100000000; Label = "Pre-Repair Assessment" }, @{Value = 100000001; Label = "In-Progress Check" }, @{Value = 100000002; Label = "Completion Report" }, @{Value = 100000003; Label = "Quality Assurance" }, @{Value = 100000004; Label = "Follow-Up" }) "ApplicationRequired"),
    (Col-Choice "iw_ConditionRating" "Condition Rating" @(@{Value = 1; Label = "1 - Critical" }, @{Value = 2; Label = "2 - Poor" }, @{Value = 3; Label = "3 - Fair" }, @{Value = 4; Label = "4 - Good" }, @{Value = 5; Label = "5 - Excellent" }) "ApplicationRequired"),
    (Col-Bool "iw_RepairCompleted" "Repair Completed" $false "ApplicationRequired"),
    (Col-Float "iw_TimeSpent" "Time Spent (hours)" 0 10000 2),
    (Col-Memo "iw_MaterialsUsed" "Materials Used" 2000 "None" "JSON materials array"),
    (Col-Memo "iw_PhotoUrls" "Photo URLs" 5000 "None" "JSON photo URLs"),
    (Col-Float "iw_Latitude" "GPS Latitude" -90 90 5),
    (Col-Float "iw_Longitude" "GPS Longitude" -180 180 5),
    (Col-Bool "iw_SafetyHazardsFound" "Safety Hazards Found"),
    (Col-Memo "iw_HazardDescription" "Hazard Description" 2000),
    (Col-Memo "iw_Notes" "Notes" 5000),
    (Col-String "iw_WeatherCondition" "Weather Condition" 100),
    (Col-Float "iw_Temperature" "Temperature (F)" -100 200 1)
)

# TABLE 3: AI Decision Log
New-DvTable -SchemaName "iw_AIDecisionLog" -DisplayName "AI Decision Log" -PluralName "AI Decision Logs" `
    -Description "Audit trail of every AI recommendation for governance" `
    -PrimaryColSchema "iw_Name" -PrimaryColDisplay "Decision Name" -PrimaryColMaxLen 200 -PrimaryColDesc "Auto-generated decision ID" `
    -Columns @(
    (Col-Choice "iw_AgentName" "Agent Name" @(@{Value = 100000000; Label = "Analysis Agent" }, @{Value = 100000001; Label = "Prioritization Agent" }, @{Value = 100000002; Label = "Crew Estimation Agent" }, @{Value = 100000003; Label = "Report Agent" }, @{Value = 100000004; Label = "NLP Dashboard Agent" }, @{Value = 100000005; Label = "Dispatch Agent" }) "ApplicationRequired"),
    (Col-Choice "iw_DecisionType" "Decision Type" @(@{Value = 100000000; Label = "Priority Ranking" }, @{Value = 100000001; Label = "Crew Assignment" }, @{Value = 100000002; Label = "Risk Assessment" }, @{Value = 100000003; Label = "Cost Estimation" }, @{Value = 100000004; Label = "Route Optimization" }, @{Value = 100000005; Label = "Weather Impact" }, @{Value = 100000006; Label = "Proactive Alert" }, @{Value = 100000007; Label = "Dispatch Recommendation" }) "ApplicationRequired"),
    (Col-Memo "iw_InputSummary" "Input Summary" 10000 "None" "JSON input data"),
    (Col-Memo "iw_OutputSummary" "Output Summary" 10000 "None" "JSON agent output"),
    (Col-Float "iw_ConfidenceScore" "Confidence Score" 0 1 4),
    (Col-Memo "iw_ReasoningJSON" "Reasoning JSON" 50000 "None" "Full reasoning chain"),
    (Col-Int "iw_TokensUsed" "Tokens Used"),
    (Col-Int "iw_ProcessingTimeMs" "Processing Time (ms)"),
    (Col-String "iw_ModelName" "Model Name" 200 "None" "e.g. gpt-4.1-mini"),
    (Col-Bool "iw_HumanOverride" "Human Override" $false "None" "Was AI decision overridden?"),
    (Col-Memo "iw_OverrideReason" "Override Reason" 2000),
    (Col-Memo "iw_RelatedWorkOrderIds" "Related Work Order IDs" 5000 "None" "JSON array of IDs")
)

# TABLE 4: Crew Schedule
New-DvTable -SchemaName "iw_CrewSchedule" -DisplayName "Crew Schedule" -PluralName "Crew Schedules" `
    -Description "Weekly crew assignments and availability" `
    -PrimaryColSchema "iw_Name" -PrimaryColDisplay "Schedule Name" -PrimaryColMaxLen 200 -PrimaryColDesc "Schedule identifier" `
    -Columns @(
    (Col-String "iw_CrewId" "Crew ID" 100 "ApplicationRequired"),
    (Col-String "iw_CrewName" "Crew Name" 200),
    (Col-DateTime "iw_WeekStart" "Week Start" "ApplicationRequired"),
    (Col-DateTime "iw_WeekEnd" "Week End" "ApplicationRequired"),
    (Col-Float "iw_PlannedHours" "Planned Hours" 0 10000 2 "None" "Planned work hours"),
    (Col-Float "iw_ActualHours" "Actual Hours" 0 10000 2),
    (Col-String "iw_ZoneAssignment" "Zone Assignment" 100),
    (Col-Choice "iw_Specialization" "Specialization" @(@{Value = 100000000; Label = "Pothole" }, @{Value = 100000001; Label = "Sidewalk" }, @{Value = 100000002; Label = "Concrete" }, @{Value = 100000003; Label = "General" })),
    (Col-Float "iw_Availability" "Availability Pct" 0 100 1),
    (Col-Int "iw_PlannedDispatches" "Planned Dispatches"),
    (Col-Int "iw_CompletedDispatches" "Completed Dispatches"),
    (Col-Bool "iw_AIOptimized" "AI Optimized" $false "None" "AI-optimized schedule?"),
    (Col-Memo "iw_Notes" "Notes" 2000)
)

# TABLE 5: Work Order Update
New-DvTable -SchemaName "iw_WorkOrderUpdate" -DisplayName "Work Order Update" -PluralName "Work Order Updates" `
    -Description "Status change log for work orders" `
    -PrimaryColSchema "iw_Name" -PrimaryColDisplay "Update Name" -PrimaryColMaxLen 200 -PrimaryColDesc "Auto-generated update ID" `
    -Columns @(
    (Col-String "iw_WorkOrderId" "Work Order ID" 100 "ApplicationRequired"),
    (Col-Choice "iw_PreviousStatus" "Previous Status" @(@{Value = 100000000; Label = "Open" }, @{Value = 100000001; Label = "Assigned" }, @{Value = 100000002; Label = "In Progress" }, @{Value = 100000003; Label = "Completed" }, @{Value = 100000004; Label = "Deferred" }) "ApplicationRequired"),
    (Col-Choice "iw_NewStatus" "New Status" @(@{Value = 100000000; Label = "Open" }, @{Value = 100000001; Label = "Assigned" }, @{Value = 100000002; Label = "In Progress" }, @{Value = 100000003; Label = "Completed" }, @{Value = 100000004; Label = "Deferred" }) "ApplicationRequired"),
    (Col-String "iw_UpdatedBy" "Updated By" 200 "None" "User or agent name"),
    (Col-Choice "iw_UpdatedSource" "Updated Source" @(@{Value = 100000000; Label = "AI Agent" }, @{Value = 100000001; Label = "Manager" }, @{Value = 100000002; Label = "Field Crew" }, @{Value = 100000003; Label = "System" })),
    (Col-Memo "iw_Notes" "Notes" 5000)
)

# TABLE 6: Crew Member (persistent roster)
New-DvTable -SchemaName "iw_CrewMember" -DisplayName "Crew Member" -PluralName "Crew Members" `
    -Description "Persistent crew/inspector roster for dispatch assignments" `
    -PrimaryColSchema "iw_Name" -PrimaryColDisplay "Crew Name" -PrimaryColMaxLen 200 -PrimaryColDesc "Display name, e.g. 'Alpha Pothole Crew'" `
    -Columns @(
    (Col-String "iw_CrewId" "Crew ID" 100 "ApplicationRequired" "Unique crew identifier"),
    (Col-Choice "iw_Specialization" "Specialization" @(@{Value = 100000000; Label = "Pothole" }, @{Value = 100000001; Label = "Sidewalk" }, @{Value = 100000002; Label = "Concrete" }, @{Value = 100000003; Label = "General" }) "ApplicationRequired"),
    (Col-Choice "iw_Status" "Status" @(@{Value = 100000000; Label = "Available" }, @{Value = 100000001; Label = "Assigned" }, @{Value = 100000002; Label = "On Break" }, @{Value = 100000003; Label = "Off Duty" }) "ApplicationRequired"),
    (Col-Float "iw_EfficiencyRating" "Efficiency Rating" 0 1 4 "None" "0-1 performance rating"),
    (Col-Float "iw_CurrentLat" "Current Latitude" -90 90 5),
    (Col-Float "iw_CurrentLng" "Current Longitude" -180 180 5),
    (Col-Int "iw_MemberCount" "Member Count" 1 50 "None" "Number of personnel"),
    (Col-String "iw_Email" "Email" 320 "None" "Contact email (optional O365 link)"),
    (Col-String "iw_Phone" "Phone" 30),
    (Col-Memo "iw_Certifications" "Certifications" 2000 "None" "JSON array of certifications"),
    (Col-Memo "iw_AssignedWorkOrders" "Assigned Work Orders" 5000 "None" "JSON array of work order IDs"),
    (Col-String "iw_Zone" "Zone" 50),
    (Col-DateTime "iw_HireDate" "Hire Date"),
    (Col-Bool "iw_IsActive" "Is Active" $true "None" "Soft delete flag")
)

# === PUBLISH ===
Write-Host "`n=== Step 4: Publishing ===" -ForegroundColor Cyan
$publishXml = '<importexportxml><entities><entity>iw_crewdispatch</entity><entity>iw_fieldinspection</entity><entity>iw_aidecisionlog</entity><entity>iw_crewschedule</entity><entity>iw_workorderupdate</entity><entity>iw_crewmember</entity></entities></importexportxml>'
$r = Invoke-Dv POST "$apiUrl/PublishXml" @{ParameterXml = $publishXml }
if ($r.OK) { Write-Host "  Published!" -ForegroundColor Green }
else { Write-Host "  Publish warning: $($r.Error)" -ForegroundColor Yellow; Write-Host "  Publish manually from make.powerapps.com" -ForegroundColor Yellow }

# === SUMMARY ===
Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host "  PROVISIONING COMPLETE" -ForegroundColor Green
Write-Host "  Created: $created | Skipped: $skipped | Failed: $failed" -ForegroundColor White
Write-Host "  Org: $OrgUrl" -ForegroundColor White
Write-Host "  Solution: $SolutionName" -ForegroundColor White
Write-Host "================================================`n" -ForegroundColor Cyan
if ($failed -gt 0) { Write-Host "  Some items failed." -ForegroundColor Red; exit 1 }
