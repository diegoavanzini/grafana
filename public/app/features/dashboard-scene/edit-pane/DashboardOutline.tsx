import { css, cx } from '@emotion/css';
import { useMemo, useState } from 'react';

import { GrafanaTheme2 } from '@grafana/data';
import { SceneObject, VizPanel } from '@grafana/scenes';
import { Box, Icon, Text, useElementSelection, useStyles2 } from '@grafana/ui';
import { Trans } from 'app/core/internationalization';

import { DashboardGridItem } from '../scene/layout-default/DashboardGridItem';
import { isInCloneChain } from '../utils/clone';
import { getDashboardSceneFor } from '../utils/utils';

import { DashboardEditPane } from './DashboardEditPane';
import { getEditableElementFor, hasEditableElement } from './shared';

export interface Props {
  editPane: DashboardEditPane;
}

export function DashboardOutline({ editPane }: Props) {
  const dashboard = getDashboardSceneFor(editPane);

  return (
    <Box padding={1} gap={0.25} display="flex" direction="column">
      <DashboardOutlineNode sceneObject={dashboard} expandable />
    </Box>
  );
}

function DashboardOutlineNode({ sceneObject, expandable }: { sceneObject: SceneObject; expandable: boolean }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { key } = sceneObject.useState();
  const styles = useStyles2(getStyles);
  const { isSelected, onSelect } = useElementSelection(key);
  const isCloned = useMemo(() => isInCloneChain(key!), [key]);
  const editableElement = useMemo(() => getEditableElementFor(sceneObject)!, [sceneObject]);

  const children = collectEditableElementChildren(sceneObject);
  const elementInfo = editableElement.getEditableElementInfo();

  return (
    <>
      <button
        role="treeitem"
        className={cx(styles.nodeButton, isCloned && styles.nodeButtonClone, isSelected && styles.nodeButtonSelected)}
        onPointerDown={(evt) => {
          onSelect?.(evt);
          setIsExpanded(!isExpanded);
        }}
      >
        {expandable && <Icon name={isExpanded ? 'angle-down' : 'angle-right'} />}
        <Icon size="sm" name={elementInfo.icon} />
        <span>{elementInfo.instanceName}</span>
      </button>

      {expandable && isExpanded && (
        <div className={styles.container} role="group">
          {children.length > 0 ? (
            children.map((child) => (
              <DashboardOutlineNode
                key={child.sceneObject.state.key}
                sceneObject={child.sceneObject}
                expandable={child.expandable}
              />
            ))
          ) : (
            <Text element="p" color="secondary">
              <Trans i18nKey="dashboard.outline.tree.item.empty">(empty)</Trans>
            </Text>
          )}
        </div>
      )}
    </>
  );
}

function getStyles(theme: GrafanaTheme2) {
  return {
    container: css({
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(0.5),
      marginLeft: theme.spacing(1),
      paddingLeft: theme.spacing(1.5),
      borderLeft: `1px solid ${theme.colors.border.medium}`,
    }),
    nodeButton: css({
      boxShadow: 'none',
      border: 'none',
      background: 'transparent',
      padding: theme.spacing(0.25, 1),
      borderRadius: theme.shape.radius.default,
      color: theme.colors.text.secondary,
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(0.5),
      overflow: 'hidden',
      '&:hover': {
        color: theme.colors.text.primary,
        outline: `1px dashed ${theme.colors.border.strong}`,
        outlineOffset: '0px',
        backgroundColor: theme.colors.emphasize(theme.colors.background.canvas, 0.08),
      },
      '> span': {
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
    }),
    nodeButtonSelected: css({
      color: theme.colors.text.primary,
      outline: `1px dashed ${theme.colors.primary.border}`,
      outlineOffset: '0px',
      '&:hover': {
        outline: `1px dashed ${theme.colors.primary.border}`,
      },
    }),
    nodeButtonClone: css({
      color: theme.colors.text.secondary,
      cursor: 'not-allowed',
    }),
  };
}

interface EditableElementConfig {
  sceneObject: SceneObject;
  expandable: boolean;
}

function collectEditableElementChildren(
  sceneObject: SceneObject,
  children: EditableElementConfig[] = []
): EditableElementConfig[] {
  sceneObject.forEachChild((child) => {
    if (child instanceof DashboardGridItem) {
      // DashboardGridItem is a special case as it can contain repeated panels
      // In this case, we want to show the repeated panels as separate items, otherwise show the body panel
      if (child.state.repeatedPanels?.length) {
        children.push(...child.state.repeatedPanels.map((panel) => ({ sceneObject: panel, expandable: false })));
      } else {
        children.push({ sceneObject: child.state.body, expandable: false });
      }
    } else if (child instanceof VizPanel) {
      children.push({ sceneObject: child, expandable: false });
    } else if (hasEditableElement(child)) {
      children.push({ sceneObject: child, expandable: true });
    } else {
      collectEditableElementChildren(child, children);
    }
  });

  return children;
}
