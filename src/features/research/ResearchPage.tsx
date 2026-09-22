import { useDocumentTitle } from '../../hooks/useUtil';
import { ResearchPanel } from './ResearchPanel';

export const ResearchPage = () => {
  useDocumentTitle('Investigación');
  return (
    <div className="page">
      <header className="page__header">
        <div className="page__title">
          <h1 className="h1">Investigación</h1>
          <span className="small muted">Guías AUA, EAU e ICS y literatura reciente vía Perplexity, con fuentes.</span>
        </div>
      </header>
      <ResearchPanel />
    </div>
  );
};
