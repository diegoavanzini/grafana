import { css } from '@emotion/css';
import { useMemo, useRef, useEffect, useState } from 'react';

import { SelectableValue } from '@grafana/data';
import { SQLEditor, LanguageDefinition } from '@grafana/plugin-ui';
import { useStyles2 } from '@grafana/ui';

import { ExpressionQuery } from '../types';

// Account for Monaco editor's border to prevent clipping
const EDITOR_BORDER_ADJUSTMENT = 2; // 1px border on top and bottom

// Define the language definition for MySQL syntax highlighting and autocomplete
const EDITOR_LANGUAGE_DEFINITION: LanguageDefinition = {
  id: 'mysql',
  // Additional properties could be added here in the future if needed
  // eg:
  // completionProvider: to autocomplete field (ie column) names when given
  // a table name (dataframe reference)
  // formatter: to format the SQL query and dashboard variables
};

interface Props {
  refIds: Array<SelectableValue<string>>;
  query: ExpressionQuery;
  onChange: (query: ExpressionQuery) => void;
}

export const SqlExpr = ({ onChange, refIds, query }: Props) => {
  const vars = useMemo(() => refIds.map((v) => v.value!), [refIds]);
  const initialQuery = `select * from ${vars[0]} limit 1`;
  const styles = useStyles2(getStyles);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ height: 0 });

  const onEditorChange = (expression: string) => {
    onChange({
      ...query,
      expression,
    });
  };

  // Set up resize observer to handle container resizing
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const { height } = entries[0].contentRect;
      setDimensions({ height });
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={styles.editorContainer}>
      <SQLEditor
        query={query.expression || initialQuery}
        onChange={onEditorChange}
        height={dimensions.height - EDITOR_BORDER_ADJUSTMENT}
        language={EDITOR_LANGUAGE_DEFINITION}
      />
    </div>
  );
};

const getStyles = () => ({
  editorContainer: css({
    height: '240px',
    resize: 'vertical',
    overflow: 'auto',
    minHeight: '100px',
  }),
});
