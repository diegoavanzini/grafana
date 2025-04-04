import { css } from '@emotion/css';
import { chain, isEmpty, truncate } from 'lodash';
import { useState } from 'react';
import { useMeasure } from 'react-use';

import { NavModelItem, UrlQueryValue } from '@grafana/data';
import { Alert, LinkButton, LoadingBar, Stack, TabContent, Text, TextLink, useStyles2 } from '@grafana/ui';
import { PageInfoItem } from 'app/core/components/Page/types';
import { useQueryParams } from 'app/core/hooks/useQueryParams';
import { Trans, t } from 'app/core/internationalization';
import InfoPausedRule from 'app/features/alerting/unified/components/InfoPausedRule';
import { RuleActionsButtons } from 'app/features/alerting/unified/components/rules/RuleActionsButtons';
import { AlertInstanceTotalState, CombinedRule, RuleHealth, RuleIdentifier } from 'app/types/unified-alerting';
import { PromAlertingRuleState, PromRuleType } from 'app/types/unified-alerting-dto';

import { defaultPageNav } from '../../RuleViewer';
import { shouldUsePrometheusRulesPrimary } from '../../featureToggles';
import { usePrometheusCreationConsistencyCheck } from '../../hooks/usePrometheusConsistencyCheck';
import { useReturnTo } from '../../hooks/useReturnTo';
import { PluginOriginBadge } from '../../plugins/PluginOriginBadge';
import { Annotation } from '../../utils/constants';
import { makeDashboardLink, makePanelLink, stringifyErrorLike } from '../../utils/misc';
import { createListFilterLink } from '../../utils/navigation';
import {
  RulePluginOrigin,
  getRulePluginOrigin,
  isFederatedRuleGroup,
  isPausedRule,
  prometheusRuleType,
  rulerRuleType,
} from '../../utils/rules';
import { AlertLabels } from '../AlertLabels';
import { AlertingPageWrapper } from '../AlertingPageWrapper';
import { ProvisionedResource, ProvisioningAlert } from '../Provisioning';
import { WithReturnButton } from '../WithReturnButton';
import { decodeGrafanaNamespace } from '../expressions/util';
import { RedirectToCloneRule } from '../rules/CloneRule';

import { FederatedRuleWarning } from './FederatedRuleWarning';
import PausedBadge from './PausedBadge';
import { useAlertRule } from './RuleContext';
import { RecordingBadge, StateBadge } from './StateBadges';
import { AlertVersionHistory } from './tabs/AlertVersionHistory';
import { Details } from './tabs/Details';
import { History } from './tabs/History';
import { InstancesList } from './tabs/Instances';
import { QueryResults } from './tabs/Query';
import { Routing } from './tabs/Routing';

export enum ActiveTab {
  Query = 'query',
  Instances = 'instances',
  History = 'history',
  Routing = 'routing',
  Details = 'details',
  VersionHistory = 'version-history',
}

const prometheusRulesPrimary = shouldUsePrometheusRulesPrimary();

const RuleViewer = () => {
  const { rule, identifier } = useAlertRule();
  const { pageNav, activeTab } = usePageNav(rule);

  // this will be used to track if we are in the process of cloning a rule
  // we want to be able to show a modal if the rule has been provisioned explain the limitations
  // of duplicating provisioned alert rules
  const [duplicateRuleIdentifier, setDuplicateRuleIdentifier] = useState<RuleIdentifier>();
  const { annotations, promRule, rulerRule } = rule;

  const hasError = isErrorHealth(promRule?.health);
  const isAlertType = prometheusRuleType.alertingRule(promRule);

  const isFederatedRule = isFederatedRuleGroup(rule.group);
  const isProvisioned = rulerRuleType.grafana.rule(rulerRule) && Boolean(rulerRule.grafana_alert.provenance);
  const isPaused = rulerRuleType.grafana.rule(rulerRule) && isPausedRule(rulerRule);

  const showError = hasError && !isPaused;
  const ruleOrigin = rulerRule ? getRulePluginOrigin(rulerRule) : getRulePluginOrigin(promRule);

  const summary = annotations[Annotation.summary];

  return (
    <AlertingPageWrapper
      pageNav={pageNav}
      navId="alert-list"
      isLoading={false}
      renderTitle={(title) => (
        <Title
          name={title}
          paused={isPaused}
          state={isAlertType ? promRule.state : undefined}
          health={promRule?.health}
          ruleType={promRule?.type}
          ruleOrigin={ruleOrigin}
        />
      )}
      actions={<RuleActionsButtons rule={rule} rulesSource={rule.namespace.rulesSource} />}
      info={createMetadata(rule)}
      subTitle={
        <Stack direction="column">
          {summary}
          {/* alerts and notifications and stuff */}
          {isPaused && <InfoPausedRule />}
          {isFederatedRule && <FederatedRuleWarning />}
          {/* indicator for rules in a provisioned group */}
          {isProvisioned && (
            <ProvisioningAlert resource={ProvisionedResource.AlertRule} bottomSpacing={0} topSpacing={2} />
          )}
          {/* error state */}
          {showError && (
            <Alert title="Something went wrong when evaluating this alert rule" bottomSpacing={0} topSpacing={2}>
              <pre style={{ marginBottom: 0 }}>
                <code>{rule.promRule?.lastError ?? 'No error message'}</code>
              </pre>
            </Alert>
          )}
        </Stack>
      }
    >
      {prometheusRulesPrimary && <PrometheusConsistencyCheck ruleIdentifier={identifier} />}
      <Stack direction="column" gap={2}>
        {/* tabs and tab content */}
        <TabContent>
          {activeTab === ActiveTab.Query && <QueryResults rule={rule} />}
          {activeTab === ActiveTab.Instances && <InstancesList rule={rule} />}
          {activeTab === ActiveTab.History && rulerRuleType.grafana.rule(rule.rulerRule) && (
            <History rule={rule.rulerRule} />
          )}
          {activeTab === ActiveTab.Routing && <Routing />}
          {activeTab === ActiveTab.Details && <Details rule={rule} />}
          {activeTab === ActiveTab.VersionHistory && rulerRuleType.grafana.rule(rule.rulerRule) && (
            <AlertVersionHistory rule={rule.rulerRule} />
          )}
        </TabContent>
      </Stack>
      {duplicateRuleIdentifier && (
        <RedirectToCloneRule
          redirectTo={true}
          identifier={duplicateRuleIdentifier}
          isProvisioned={isProvisioned}
          onDismiss={() => setDuplicateRuleIdentifier(undefined)}
        />
      )}
    </AlertingPageWrapper>
  );
};

const createMetadata = (rule: CombinedRule): PageInfoItem[] => {
  const { labels, annotations, group } = rule;
  const metadata: PageInfoItem[] = [];

  const runbookUrl = annotations[Annotation.runbookURL];
  const dashboardUID = annotations[Annotation.dashboardUID];
  const panelID = annotations[Annotation.panelID];

  const hasDashboardAndPanel = dashboardUID && panelID;
  const hasDashboard = dashboardUID;
  const hasLabels = !isEmpty(labels);

  const interval = group.interval;
  const styles = useStyles2(getStyles);

  if (runbookUrl) {
    /* TODO instead of truncating the string, we should use flex and text overflow properly to allow it to take up all of the horizontal space available */
    const truncatedUrl = truncate(runbookUrl, { length: 42 });
    const valueToAdd = isValidRunbookURL(runbookUrl) ? (
      <TextLink variant="bodySmall" className={styles.url} href={runbookUrl} external>
        {truncatedUrl}
      </TextLink>
    ) : (
      <Text variant="bodySmall">{truncatedUrl}</Text>
    );
    metadata.push({
      label: 'Runbook URL',
      value: valueToAdd,
    });
  }

  if (hasDashboardAndPanel) {
    metadata.push({
      label: 'Dashboard and panel',
      value: (
        <WithReturnButton
          title={rule.name}
          component={
            <TextLink variant="bodySmall" href={makePanelLink(dashboardUID, panelID)}>
              View panel
            </TextLink>
          }
        />
      ),
    });
  } else if (hasDashboard) {
    metadata.push({
      label: 'Dashboard',
      value: (
        <WithReturnButton
          title={rule.name}
          component={
            <TextLink title={rule.name} variant="bodySmall" href={makeDashboardLink(dashboardUID)}>
              View dashboard
            </TextLink>
          }
        />
      ),
    });
  }
  if (rulerRuleType.grafana.recordingRule(rule.rulerRule)) {
    const metric = rule.rulerRule?.grafana_alert.record?.metric ?? '';
    metadata.push({
      label: 'Metric name',
      value: <Text color="primary">{metric}</Text>,
    });
  }

  if (interval) {
    metadata.push({
      label: 'Evaluation interval',
      value: <Text color="primary">Every {interval}</Text>,
    });
  }

  if (hasLabels) {
    metadata.push({
      label: 'Labels',
      /* TODO truncate number of labels, maybe build in to component? */
      value: <AlertLabels labels={labels} size="sm" />,
    });
  }

  return metadata;
};

interface TitleProps {
  name: string;
  paused?: boolean;
  // recording rules don't have a state
  state?: PromAlertingRuleState;
  health?: RuleHealth;
  ruleType?: PromRuleType;
  ruleOrigin?: RulePluginOrigin;
}

export const Title = ({ name, paused = false, state, health, ruleType, ruleOrigin }: TitleProps) => {
  const isRecordingRule = ruleType === PromRuleType.Recording;

  const { returnTo } = useReturnTo('/alerting/list');

  return (
    <Stack direction="row" gap={1} minWidth={0} alignItems="center">
      <LinkButton variant="secondary" icon="angle-left" href={returnTo} />
      {ruleOrigin && <PluginOriginBadge pluginId={ruleOrigin.pluginId} size="lg" />}
      <Text variant="h1" truncate>
        {name}
      </Text>
      {paused ? (
        <PausedBadge />
      ) : (
        <>
          {/* recording rules won't have a state */}
          {state && <StateBadge state={state} health={health} />}
          {isRecordingRule && <RecordingBadge health={health} />}
        </>
      )}
    </Stack>
  );
};

/**
 * This component displays an Alert warning component if discovers inconsistencies between Prometheus and Ruler rules
 * It will show loading indicator until the Prometheus and Ruler rule is consistent
 * It will not show the warning if the rule is Grafana managed
 */
function PrometheusConsistencyCheck({ ruleIdentifier }: { ruleIdentifier: RuleIdentifier }) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();
  const { isConsistent, error } = usePrometheusCreationConsistencyCheck(ruleIdentifier);

  if (isConsistent) {
    return null;
  }

  if (error) {
    return (
      <Alert title="Unable to check the rule status" bottomSpacing={0} topSpacing={2}>
        {stringifyErrorLike(error)}
      </Alert>
    );
  }

  return (
    <Stack direction="column" gap={0} ref={ref}>
      <LoadingBar width={width} />
      <Alert
        title={t('alerting.rule-viewer.prometheus-consistency-check.alert-title', 'Update in progress')}
        severity="info"
      >
        <Trans i18nKey="alerting.rule-viewer.prometheus-consistency-check.alert-message">
          Alert rule has been updated. Changes may take up to a minute to appear on the Alert rules list view.
        </Trans>
      </Alert>
    </Stack>
  );
}

export const isErrorHealth = (health?: RuleHealth) => health === 'error' || health === 'err';

export function useActiveTab(): [ActiveTab, (tab: ActiveTab) => void] {
  const [queryParams, setQueryParams] = useQueryParams();
  const tabFromQuery = queryParams.tab;

  const activeTab = isValidTab(tabFromQuery) ? tabFromQuery : ActiveTab.Query;

  const setActiveTab = (tab: ActiveTab) => {
    setQueryParams({ tab });
  };

  return [activeTab, setActiveTab];
}

function isValidTab(tab: UrlQueryValue): tab is ActiveTab {
  const isString = typeof tab === 'string';
  // @ts-ignore
  return isString && Object.values(ActiveTab).includes(tab);
}

function usePageNav(rule: CombinedRule) {
  const [activeTab, setActiveTab] = useActiveTab();

  const { annotations, promRule, rulerRule } = rule;

  const summary = annotations[Annotation.summary];
  const isAlertType = prometheusRuleType.alertingRule(promRule);
  const numberOfInstance = isAlertType ? calculateTotalInstances(rule.instanceTotals) : undefined;

  const namespaceName = decodeGrafanaNamespace(rule.namespace).name;
  const groupName = rule.group.name;

  const isGrafanaAlertRule = rulerRuleType.grafana.rule(rulerRule) && isAlertType;
  const grafanaRecordingRule = rulerRuleType.grafana.recordingRule(rulerRule);
  const isRecordingRuleType = prometheusRuleType.recordingRule(promRule);

  const pageNav: NavModelItem = {
    ...defaultPageNav,
    text: rule.name,
    subTitle: summary,
    children: [
      {
        text: 'Query and conditions',
        active: activeTab === ActiveTab.Query,
        onClick: () => {
          setActiveTab(ActiveTab.Query);
        },
      },
      {
        text: 'Instances',
        active: activeTab === ActiveTab.Instances,
        onClick: () => {
          setActiveTab(ActiveTab.Instances);
        },
        tabCounter: numberOfInstance,
        hideFromTabs: isRecordingRuleType,
      },
      {
        text: 'History',
        active: activeTab === ActiveTab.History,
        onClick: () => {
          setActiveTab(ActiveTab.History);
        },
        // alert state history is only available for Grafana managed alert rules
        hideFromTabs: !isGrafanaAlertRule,
      },
      {
        text: 'Details',
        active: activeTab === ActiveTab.Details,
        onClick: () => {
          setActiveTab(ActiveTab.Details);
        },
      },
      {
        text: 'Versions',
        active: activeTab === ActiveTab.VersionHistory,
        onClick: () => {
          setActiveTab(ActiveTab.VersionHistory);
        },
        hideFromTabs: !isGrafanaAlertRule && !grafanaRecordingRule,
      },
    ],
    parentItem: {
      text: groupName,
      url: createListFilterLink([
        ['namespace', namespaceName],
        ['group', groupName],
      ]),
      // @TODO support nested folders here
      parentItem: {
        text: namespaceName,
        url: createListFilterLink([['namespace', namespaceName]]),
      },
    },
  };

  return {
    pageNav,
    activeTab,
  };
}

export const calculateTotalInstances = (stats: CombinedRule['instanceTotals']) => {
  return chain(stats)
    .pick([
      AlertInstanceTotalState.Alerting,
      AlertInstanceTotalState.Pending,
      AlertInstanceTotalState.Normal,
      AlertInstanceTotalState.NoData,
      AlertInstanceTotalState.Error,
    ])
    .values()
    .sum()
    .value();
};

const getStyles = () => ({
  title: css({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  }),
  url: css({
    wordBreak: 'break-all',
  }),
});

function isValidRunbookURL(url: string) {
  const isRelative = url.startsWith('/');
  let isAbsolute = false;

  try {
    new URL(url);
    isAbsolute = true;
  } catch (_) {
    return false;
  }

  return isRelative || isAbsolute;
}

export default RuleViewer;
