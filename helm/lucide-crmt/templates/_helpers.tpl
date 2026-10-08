{{/*
Expand the name of the chart.
*/}}
{{- define "lucide-crmt.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "lucide-crmt.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "lucide-crmt.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "lucide-crmt.labels" -}}
helm.sh/chart: {{ include "lucide-crmt.chart" . }}
{{ include "lucide-crmt.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.labels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "lucide-crmt.selectorLabels" -}}
app.kubernetes.io/name: {{ include "lucide-crmt.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "lucide-crmt.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "lucide-crmt.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the secret
*/}}
{{- define "lucide-crmt.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- include "lucide-crmt.fullname" . }}-secret
{{- end }}
{{- end }}

{{/*
Create the name of the configmap
*/}}
{{- define "lucide-crmt.configMapName" -}}
{{- if .Values.configMap.existingConfigMap }}
{{- .Values.configMap.existingConfigMap }}
{{- else }}
{{- include "lucide-crmt.fullname" . }}-config
{{- end }}
{{- end }}

{{/*
Return the namespace
*/}}
{{- define "lucide-crmt.namespace" -}}
{{- if .Values.namespace.create }}
{{- .Values.namespace.name }}
{{- else }}
{{- .Release.Namespace }}
{{- end }}
{{- end }}
